'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { query, serialized } from '@/lib/db';
import { Service } from '@/lib/service';
import { ensure, DomainError } from '@/lib/domain';
import { storeDocument, purgeDocuments, deleteDocument } from '@/lib/documents';
import { stageImport, publishImport, type ImportKind } from '@/lib/imports';

export async function act(form:FormData) {
  const op=String(form.get('op')||''), data:Record<string,any>={};
  for(const [key,value] of form) if(typeof value==='string') data[key]=value;
  for(const key of ['family_id','teacher_id','school_id','parent_phone']) if(data[key]==='') delete data[key];
  const user=await currentUser();
  if(!user&&op!=='privacy') redirect('/autentificare');
  let target=String(form.get('returnTo')||'/cont');
  if(!target.startsWith('/')||target.startsWith('//')||target.includes('\\')||/[\u0000-\u0020]/.test(target)) target='/cont';
  let message='Modificările au fost salvate.',error=false;
  const requestHeaders=await headers();
  await serialized(async()=>{
    const s=new Service(query); let stored:string|undefined;
    await query('BEGIN');
    try {
      const id=user?.id||'';
      switch(op) {
        case 'onboard': await s.onboard(id,data); break;
        case 'family': await s.family(id,data); break;
        case 'familyAccept': await s.acceptFamily(id,data.id); break;
        case 'familyRevoke': await s.revokeFamily(id,data.id); break;
        case 'check': {
          await s.actor(id);
          const file=form.get('document'); ensure(file instanceof File,'Atașează o dovadă.');
          stored=await storeDocument(query,id,file);
          const details=data.kind==='correction'?{name:data.correction_name,subject:data.correction_subject,school_id:data.correction_school_id,start_year:data.correction_start_year}:{};
          await s.submitCheck(id,{...data,details},stored); break;
        }
        case 'checkDecide': await s.decideCheck(id,data.id,data.decision==='approve',data.reason); break;
        case 'review': await s.saveReview(id,data); message='Recenzia a fost trimisă pentru verificare.'; break;
        case 'reviewDecide': await s.moderateReview(id,data.id,data.decision==='approve',data.reason); break;
        case 'guardianDecide': ensure(['review','request'].includes(data.kind),'Tip invalid.'); await s.guardianDecision(id,data.kind,data.id,data.decision==='approve'); break;
        case 'report': await s.report(id,data.id,data.reason); break;
        case 'reply': await s.reply(id,data.id,data.body); break;
        case 'replyDecide': {
          await s.staff(id); ensure(data.reason?.length>=5,'Adaugă motivul.');
          await query("UPDATE reviews SET reply=CASE WHEN $1 THEN reply_pending ELSE reply END,reply_pending=NULL WHERE id=$2",[data.decision==='approve',data.id]);
          await s.audit(id,'reply.moderate',data.id,data.reason); break;
        }
        case 'reportResolve': {
          await s.staff(id); ensure(data.reason?.length>=5,'Adaugă motivul.');
          await query("UPDATE reports SET status='resolved',resolution=$1 WHERE id=$2",[data.reason,data.id]);
          await s.audit(id,'report.resolve',data.id,data.reason); break;
        }
        case 'offer': ensure(data.not_current_students==='yes','Confirmă condiția privind elevii proprii.'); await s.offer(id,data); break;
        case 'offerDisable': {
          await s.actor(id); await query('UPDATE offers SET active=false WHERE id=$1 AND teacher_id IN(SELECT id FROM teachers WHERE claimed_by=$2)',[data.id,id]); break;
        }
        case 'request': await s.request(id,data); break;
        case 'requestDecide': await s.requestDecision(id,data.id,data.decision==='approve'); break;
        case 'alumni': await s.alumni(id,{...data,published:data.published==='yes'}); break;
        case 'privacy': {
          const fingerprint=createHash('sha256').update((requestHeaders.get('x-forwarded-for')||'local')+String(data.contact)).digest('hex');
          await s.limit('privacy:'+fingerprint,5,86400);
          await s.privacy(user?.id||null,data); message='Cererea a fost înregistrată. Echipa o va analiza.'; break;
        }
        case 'privacyDecide': ensure(data.identity_confirmed==='yes','Confirmă verificarea solicitantului înainte de decizie.'); await s.privacyDecision(id,data.id,data.decision==='approve',data.reason); break;
        case 'source': {
          await s.staff(id,true);
          const v=z.object({title:z.string().min(3).max(200),url:z.string().url().refine(s=>s.startsWith('https://')),publisher:z.string().min(2).max(200),year:z.coerce.number().int().min(2000).max(new Date().getFullYear()),license:z.string().min(5).max(2000)}).parse(data);
          await query('INSERT INTO sources(id,title,url,publisher,year,license) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),v.title,v.url,v.publisher,v.year,v.license]); break;
        }
        case 'sourceDecide': {
          await s.staff(id,true); ensure(data.reason?.length>=10,'Documentează condițiile reutilizării.');
          await query('UPDATE sources SET status=$1 WHERE id=$2',[data.decision==='approve'?'approved':'rejected',data.id]);
          await s.audit(id,'source.validate',data.id,data.reason); break;
        }
        case 'import': {
          await s.staff(id,true);
          const file=form.get('file');
          const payload=file instanceof File&&file.size?await file.text():data.payload;
          await stageImport(query,data.kind as ImportKind,data.source_id,JSON.parse(payload)); break;
        }
        case 'importPublish': {
          await s.staff(id,true); ensure(data.reason?.length>=10,'Documentează validarea lotului.');
          await publishImport(query,data.id); await s.audit(id,'import.publish',data.id,data.reason); break;
        }
        default: throw new DomainError('Acțiune necunoscută.');
      }
      await query('COMMIT');
    } catch(e) {
      await query('ROLLBACK');
      if(stored) await deleteDocument(query,stored);
      error=true;
      if(e instanceof DomainError) message=e.message;
      else if(e instanceof z.ZodError) message='Verifică datele introduse: '+e.issues.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');
      else if(e instanceof SyntaxError) message='Fișierul sau textul JSON nu este valid.';
      else { console.error('Action failed',op,e instanceof Error?e.message:'unknown'); message='Operația nu a putut fi salvată. Verifică datele și încearcă din nou.'; }
    }
    await purgeDocuments(query);
  });
  revalidatePath('/','layout');
  const url=new URL(target,'http://local'); url.searchParams.set(error?'error':'success',message);
  redirect(url.pathname+url.search+url.hash);
}
