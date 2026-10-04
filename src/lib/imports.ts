import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Query } from './db';
import { ensure, normalize } from './domain';

const school = z.object({official_id:z.string().min(1).max(100),name:z.string().min(3).max(250),county:z.string().min(2).max(80),city:z.string().min(2).max(100),type:z.enum(['liceu','gimnaziu','colegiu']),enrolled:z.number().int().nonnegative().nullable().default(null),enrolled_year:z.string().nullable().default(null)}).strict();
const teacher = z.object({source_key:z.string().min(1).max(150),name:z.string().min(3).max(120),subjects:z.array(z.string().min(2).max(80)).min(1).max(10),school_ids:z.array(z.string()).min(1).max(20),start_year:z.number().int().min(1950).max(new Date().getFullYear()).nullable().default(null)}).strict();
const statistic = z.object({school_id:z.string(),exam:z.enum(['BAC','EN','ADMITERE']),year:z.number().int().min(2000).max(new Date().getFullYear()),session:z.string().min(1),specialization:z.string().default(''),stage:z.string().default(''),candidates:z.number().int().nonnegative(),attended:z.number().int().nonnegative().nullable(),valid:z.number().int().nonnegative().nullable(),promoted:z.number().int().nonnegative().nullable(),mean:z.number().min(0).max(10).nullable(),minimum:z.number().min(0).max(10).nullable().default(null),distribution:z.record(z.string(),z.number().int().nonnegative()).default({})}).strict().superRefine((s,ctx)=>{
  if((s.attended??0)>s.candidates||(s.valid??0)>(s.attended??0)||(s.promoted??0)>(s.attended??0)) ctx.addIssue({code:'custom',message:'Numerele de participanți, rezultate valide și promovați sunt inconsistente.'});
  if(s.mean!==null&&!s.valid) ctx.addIssue({code:'custom',message:'Media necesită rezultate valide.'});
  if(Object.keys(s.distribution).length&&Object.values(s.distribution).reduce((a,b)=>a+b,0)!==s.valid) ctx.addIssue({code:'custom',message:'Distribuția trebuie să însumeze numărul rezultatelor valide.'});
  if(s.exam==='ADMITERE'&&(!s.specialization||!s.stage)) ctx.addIssue({code:'custom',message:'Admiterea necesită specializare și etapă.'});
});
export const importSchemas = {schools:school,teachers:teacher,statistics:statistic};
export type ImportKind = keyof typeof importSchemas;
export async function validateRows(q:Query,kind:ImportKind,rows:unknown[],sourceId:string) {
  const errors:string[]=[],parsed:any[]=[],seen=new Set<string>();
  for(const [index,row] of rows.entries()) {
    const result=importSchemas[kind].safeParse(row);
    if(!result.success) { errors.push(`Rând ${index+1}: ${result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; ')}`); continue; }
    const r=result.data as any;
    const key=kind==='schools'?r.official_id:kind==='teachers'?r.source_key:[r.school_id,r.exam,r.year,r.session,r.specialization,r.stage].join('|');
    if(seen.has(key)) errors.push(`Rând ${index+1}: identificator duplicat în lot.`); seen.add(key);
    if(kind==='teachers') {
      for(const sid of r.school_ids) if(!(await q('SELECT id FROM schools WHERE id=$1',[sid])).length) errors.push(`Rând ${index+1}: școală necunoscută ${sid}.`);
      const matching=await q('SELECT id FROM teachers WHERE lower(name)=lower($1) AND source_key<>$2 AND NOT withdrawn',[r.name,r.source_key]);
      if(matching.length) errors.push(`Rând ${index+1}: omonim sau duplicat posibil; folosește identificatorul stabil confirmat după verificare manuală.`);
    }
    if(kind==='statistics') {
      const s=(await q('SELECT type,demo FROM schools WHERE id=$1',[r.school_id]))[0];
      if(!s) errors.push(`Rând ${index+1}: instituție necunoscută.`);
      else if((r.exam==='BAC'||r.exam==='ADMITERE')&&s.type==='gimnaziu') errors.push(`Rând ${index+1}: BAC/admitere atribuite unei școli gimnaziale.`);
    }
    parsed.push(r);
  }
  const source=(await q('SELECT * FROM sources WHERE id=$1',[sourceId]))[0]; ensure(source,'Sursa nu există.');
  return {errors,parsed};
}
export async function stageImport(q:Query,kind:ImportKind,sourceId:string,input:unknown) {
  ensure(kind in importSchemas,'Tip de import invalid.');
  const rows=z.array(z.unknown()).min(1).max(50000).parse(input);
  const digest=createHash('sha256').update(JSON.stringify({kind,sourceId,rows})).digest('hex');
  const existing=(await q('SELECT id,status FROM import_batches WHERE digest=$1',[digest]))[0]; if(existing) return existing.id;
  const {errors,parsed}=await validateRows(q,kind,rows,sourceId),id=randomUUID();
  await q('INSERT INTO import_batches(id,digest,source_id,kind,payload,errors,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,digest,sourceId,kind,JSON.stringify(parsed),JSON.stringify(errors),errors.length?'invalid':'pending']);
  return id;
}
export async function publishImport(q:Query,id:string) {
  const b=(await q('SELECT b.*,s.status AS source_status,s.demo FROM import_batches b JOIN sources s ON s.id=b.source_id WHERE b.id=$1',[id]))[0];
  ensure(b,'Lot inexistent.'); if(b.status==='published') return;
  ensure(b.status==='pending'&&b.source_status==='approved','Sursa și lotul trebuie validate înainte de publicare.');
  const {errors,parsed}=await validateRows(q,b.kind,b.payload,b.source_id); ensure(!errors.length,errors.slice(0,3).join(' '));
  for(const r of parsed) {
    if(b.kind==='schools') {
      const sid='ro-'+createHash('sha256').update(r.official_id).digest('hex').slice(0,16);
      await q('INSERT INTO schools(id,official_id,name,county,city,type,enrolled,enrolled_year,source_id,demo,search_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(official_id) DO UPDATE SET name=excluded.name,county=excluded.county,city=excluded.city,type=excluded.type,enrolled=excluded.enrolled,enrolled_year=excluded.enrolled_year,source_id=excluded.source_id,search_text=excluded.search_text',
        [sid,r.official_id,r.name,r.county,r.city,r.type,r.enrolled,r.enrolled_year,b.source_id,b.demo,normalize(`${r.name} ${r.county} ${r.city}`)]);
    }
    if(b.kind==='teachers') {
      if((await q('SELECT source_key FROM suppressions WHERE source_key=$1',[r.source_key])).length) continue;
      const current=(await q('SELECT id,claimed_by FROM teachers WHERE source_key=$1',[r.source_key]))[0];
      if(current?.claimed_by) continue; // Verified owner corrections win over bulk source refreshes.
      const tid=current?.id||randomUUID();
      await q('INSERT INTO teachers(id,source_key,name,subjects,start_year,experience_confirmed,source_id,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,subjects=excluded.subjects,start_year=excluded.start_year,experience_confirmed=excluded.experience_confirmed,source_id=excluded.source_id,updated_at=now()',
        [tid,r.source_key,r.name,JSON.stringify(r.subjects),r.start_year,r.start_year!==null,b.source_id,b.demo]);
      await q('DELETE FROM affiliations WHERE teacher_id=$1',[tid]);
      for(const sid of r.school_ids) await q('INSERT INTO affiliations(teacher_id,school_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[tid,sid]);
    }
    if(b.kind==='statistics') await q('INSERT INTO statistics(id,school_id,exam,year,session,specialization,stage,candidates,attended,valid,promoted,mean,minimum,distribution,source_id,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(school_id,exam,year,session,specialization,stage) DO UPDATE SET candidates=excluded.candidates,attended=excluded.attended,valid=excluded.valid,promoted=excluded.promoted,mean=excluded.mean,minimum=excluded.minimum,distribution=excluded.distribution,source_id=excluded.source_id',
      [randomUUID(),r.school_id,r.exam,r.year,r.session,r.specialization,r.stage,r.candidates,r.attended,r.valid,r.promoted,r.mean,r.minimum,JSON.stringify(r.distribution),b.source_id,b.demo]);
  }
  await q("UPDATE import_batches SET status='published',published_at=now() WHERE id=$1",[id]);
}
