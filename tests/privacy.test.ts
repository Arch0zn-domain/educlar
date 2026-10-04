import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdir,mkdtemp,rm,access } from 'node:fs/promises';
import path from 'node:path';
import type { openDatabase,Query } from '../src/lib/db';
import type { Service as ServiceType } from '../src/lib/service';
const identity=vi.hoisted(()=>({id:'demo-student'}));
vi.mock('../src/lib/auth',()=>({currentUser:async()=>({id:identity.id})}));
type DB=Awaited<ReturnType<typeof openDatabase>>;
let db:DB,q:Query,s:ServiceType,dir:string;
let read:typeof import('../src/lib/read'),docs:typeof import('../src/lib/documents'),privacy:typeof import('../src/lib/privacy'),maintenance:typeof import('../src/lib/maintenance');
const root=path.resolve('.data');
beforeAll(async()=>{
  await mkdir(root,{recursive:true});dir=await mkdtemp(path.join(root,'p1-tests-'));process.env.DATA_DIR=dir;
  const {openDatabase}=await import('../src/lib/db');db=await openDatabase(dir,true);q=db.query;
  (globalThis as unknown as {eduDb:Promise<DB>}).eduDb=Promise.resolve(db);
  const {Service}=await import('../src/lib/service');s=new Service(q);
  read=await import('../src/lib/read');docs=await import('../src/lib/documents');privacy=await import('../src/lib/privacy');maintenance=await import('../src/lib/maintenance');
});
beforeEach(async()=>{identity.id='demo-student';await q('BEGIN');});
afterEach(async()=>{maintenance.stopRetentionJob();await q('ROLLBACK');});
afterAll(async()=>{
  await db.close();
  if(dir&&path.resolve(dir).startsWith(root+path.sep)&&path.basename(dir).startsWith('p1-tests-'))await rm(dir,{recursive:true,force:true});
});
const input={teacher_id:'ana-pop',context:'class',academic_year:'2025–2026',body:'O experiență de test cu explicații detaliate și feedback la exerciții.',clarity:5,respect:5,fairness:4,feedback:5};
const reason='Identitate și operație verificate în demonstrație.';
async function request(kind:string,user:string|null='demo-student',teacher?:string) {
  return s.privacy(user,{kind,teacher_id:teacher,contact:'test@example.invalid',message:'Solicitare de test pentru fluxul de protecție a datelor.'});
}
async function proof(owner='demo-teacher') {
  return docs.storeDocument(q,owner,new File([Buffer.from('%PDF-1.4\nSynthetic evidence only')],'test.pdf',{type:'application/pdf'}));
}
describe('P1 suppression in every public projection',()=>{
  it('suppresses the same cohort in the catalog, JSON, school detail and comparison',async()=>{
    await q("UPDATE statistics SET candidates=20,attended=20,valid=20,mean=7.31,distribution='{\"small\":1,\"rest\":19}' WHERE id='orizont-2025'");
    const catalog=await read.catalog({q:'orizont'});expect(catalog.schools[0].average).toBeNull();
    const {GET}=await import('../src/app/api/catalog/route');const json=await(await GET(new Request('http://127.0.0.1/api/catalog?q=orizont'))).json();expect(json.schools[0].average).toBeNull();
    expect(JSON.stringify(json)).not.toContain('7.31');
    const detail=await read.schoolDetail('orizont');const stat=detail!.stats.find(x=>x.id==='orizont-2025');expect(stat).toMatchObject({mean:null,suppressed:true,distribution:{}});
    const {renderToStaticMarkup}=await import('react-dom/server');
    const Compare=(await import('../src/app/compara/page')).default;
    const html=renderToStaticMarkup(await Compare({searchParams:Promise.resolve({ids:'orizont',year:'2025',exam:'BAC',session:'vară'})}));
    expect(html).not.toContain('7,31');expect(html).toContain('—');
  });
  it('does not fall back to an earlier unsuppressed mean for a small latest cohort',async()=>{
    await q("UPDATE statistics SET candidates=8,mean=7.31,distribution='{}' WHERE id='orizont-2025'");
    expect((await read.catalog({q:'orizont'})).schools[0].average).toBeNull();
  });
});
describe('P1 privacy outcomes and permissions',()=>{
  it('rejects empty correction/illegal approval without recording completion',async()=>{
    for(const kind of ['correction','illegal']){
      const id=await request(kind);await expect(s.privacyDecision('demo-admin',id,true,reason)).rejects.toThrow();
      expect((await q('SELECT status,outcome FROM privacy_requests WHERE id=$1',[id]))[0]).toMatchObject({status:'pending',outcome:{}});
    }
  });
  it('generates a private export excluding secrets and other peoples’ identities',async()=>{
    await q("INSERT INTO auth_session(id,token,expires_at,user_id) VALUES('private-session','SECRET-SESSION',now()+interval '1 day','demo-student')");
    const id=await request('access');await s.privacyDecision('demo-admin',id,true,reason);
    const row=(await q('SELECT status,outcome FROM privacy_requests WHERE id=$1',[id]))[0];expect(row).toMatchObject({status:'completed',outcome:{action:'export_generated'}});
    const data=await privacy.privacyExport(q,'demo-student',id);expect(data.user.phone_number).toBe('+40700000003');
    expect(JSON.stringify(data)).not.toContain('SECRET-SESSION');expect(JSON.stringify(data)).not.toContain('+40700000002');
    await expect(privacy.privacyExport(q,'demo-parent',id)).rejects.toThrow('indisponibil');
    const {GET}=await import('../src/app/api/privacy/[id]/export/route');
    identity.id='demo-parent';expect((await GET(new Request('http://local'),{params:Promise.resolve({id})})).status).toBe(404);
    identity.id='demo-student';const response=await GET(new Request('http://local'),{params:Promise.resolve({id})});expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
    await q("UPDATE privacy_requests SET export_expires_at=now()-interval '1 second' WHERE id=$1",[id]);await maintenance.runMaintenance(q);
    expect((await q('SELECT export_data FROM privacy_requests WHERE id=$1',[id]))[0].export_data).toBeNull();
  });
  it('requires an identified subject for anonymous access and keeps moderators out',async()=>{
    const id=await request('access',null);
    await expect(s.privacyDecision('demo-admin',id,true,reason)).rejects.toThrow('verificat');
    await expect(s.privacyDecision('demo-moderator',id,true,reason,{subject_id:'demo-student'})).rejects.toThrow('permisiunea');
    await s.privacyDecision('demo-admin',id,true,reason,{subject_id:'demo-student'});
    expect((await q('SELECT subject_id,status FROM privacy_requests WHERE id=$1',[id]))[0]).toMatchObject({subject_id:'demo-student',status:'completed'});
  });
  it('actually applies a whitelisted correction and cannot escalate privileges',async()=>{
    const id=await request('correction');
    await expect(s.privacyDecision('demo-admin',id,true,reason,{correction_target:'account',correction_field:'staff_role',correction_value:'admin'})).rejects.toThrow('câmp');
    await s.privacyDecision('demo-admin',id,true,reason,{correction_target:'account',correction_field:'name',correction_value:'Nume corectat de test'});
    expect((await q("SELECT name FROM auth_user WHERE id='demo-student'"))[0].name).toBe('Nume corectat de test');
    expect((await q('SELECT outcome,status FROM privacy_requests WHERE id=$1',[id]))[0]).toMatchObject({status:'completed',outcome:{action:'data_corrected',field:'name'}});
  });
  it('corrects verified teacher experience only on the subject’s claimed profile',async()=>{
    await q("UPDATE teachers SET start_year=NULL,experience_confirmed=false WHERE id='ana-pop'");
    const other=await request('correction','demo-teacher','mihai-stan');
    const correction={correction_target:'teacher',correction_field:'start_year',correction_value:'2010'};
    await expect(s.privacyDecision('demo-admin',other,true,reason,correction)).rejects.toThrow('aparțin');
    const id=await request('correction','demo-teacher','ana-pop');
    await s.privacyDecision('demo-admin',id,true,reason,correction);
    expect((await q("SELECT start_year,experience_confirmed FROM teachers WHERE id='ana-pop'"))[0]).toMatchObject({start_year:2010,experience_confirmed:true});
  });
  it('removes only the targeted illegal content and records the action',async()=>{
    const id=await request('illegal',null);
    await s.privacyDecision('demo-admin',id,true,reason,{content_type:'review',content_id:'review-0'});
    expect((await q("SELECT status,body FROM reviews WHERE id='review-0'"))[0]).toMatchObject({status:'rejected',body:'Conținut retras.'});
    expect((await q("SELECT status FROM reviews WHERE id='review-1'"))[0].status).toBe('approved');
    expect((await q('SELECT outcome FROM privacy_requests WHERE id=$1',[id]))[0].outcome).toMatchObject({action:'content_removed',target_id:'review-0'});
  });
  it('withdraws a profile and preserves reimport suppression',async()=>{
    const id=await request('profile','demo-teacher','ana-pop');await s.privacyDecision('demo-admin',id,true,reason);
    expect(await read.teacherDetail('ana-pop')).toBeNull();expect((await q("SELECT source_key FROM suppressions WHERE source_key='demo:ana-pop'"))).toHaveLength(1);
    expect((await q('SELECT outcome,status FROM privacy_requests WHERE id=$1',[id]))[0]).toMatchObject({status:'completed',outcome:{action:'profile_withdrawn'}});
  });
});
describe('P1 account erasure and evidence retries',()=>{
  it('clears replies, reports, check reasons, requests, families and evidence; retries file failures',async()=>{
    const marker='PRIVATE-ERASURE-FIXTURE';const doc=await proof();
    await s.reply('demo-teacher','review-0',marker+' approved reply');
    let pending=(await q("SELECT * FROM reviews WHERE id='review-0'"))[0];await s.moderateReply('demo-admin','review-0',true,reason,pending.version,pending.reply_pending_id);
    await s.reply('demo-teacher','review-1',marker+' pending reply');
    await s.report('demo-teacher','review-2',marker+' report');
    await q('UPDATE reports SET resolution=$1 WHERE user_id=$2',[marker,'demo-teacher']);
    await q("INSERT INTO checks(id,user_id,kind,academic_year,document_id,details,reason) VALUES('erase-check','demo-teacher','claim','2025–2026',$1,$2,$3)",[doc,JSON.stringify({note:marker}),marker]);
    await q("INSERT INTO requests(id,offer_id,user_id,message,status) VALUES('erase-request','oferta-ana','demo-teacher',$1,'accepted')",[marker]);
    await q("UPDATE families SET parent_id='demo-teacher',label=$1 WHERE id='demo-family'",[marker]);
    await q("INSERT INTO auth_session(id,token,user_id,expires_at) VALUES('erase-session',$1,'demo-teacher',now()+interval '1 day')",[marker]);
    await q("INSERT INTO auth_verification(id,identifier,value,expires_at) VALUES('erase-otp','phone-+40700000004',$1,now()+interval '1 day')",[marker]);
    await s.audit('demo-admin','check.approve','erase-check',marker+' copied check reason');
    await s.audit('demo-admin','report.resolve',(await q("SELECT id FROM reports WHERE user_id='demo-teacher'"))[0].id,marker+' copied report reason');
    const id=await request('account','demo-teacher');await s.privacyDecision('demo-admin',id,true,marker+' decision reason');
    const result=(await q('SELECT * FROM privacy_requests WHERE id=$1',[id]))[0];expect(result.status).toBe('processing');
    expect((await q("SELECT disabled FROM profiles WHERE user_id='demo-teacher'"))[0].disabled).toBe(true);
    for(const sql of ["SELECT reply,reply_pending FROM reviews WHERE id IN('review-0','review-1')","SELECT reason,resolution FROM reports WHERE user_id='demo-teacher'","SELECT reason,details FROM checks WHERE id='erase-check'","SELECT message FROM requests WHERE id='erase-request'","SELECT label,invited_phone,status FROM families WHERE id='demo-family'"]){expect(JSON.stringify(await q(sql))).not.toContain(marker);}
    expect(await q("SELECT * FROM auth_session WHERE user_id='demo-teacher'")).toHaveLength(0);expect(await q("SELECT * FROM auth_verification WHERE id='erase-otp'")).toHaveLength(0);
    expect(JSON.stringify(await q('SELECT reason FROM audit'))).not.toContain(marker);
    // First attempt is a real observable I/O failure; completion must remain pending.
    const fail=async()=>{throw Object.assign(new Error('Simulated denial'),{code:'EACCES'});};
    const run=await maintenance.runMaintenance(q,fail);expect(run.failed).toBe(1);
    identity.id='demo-admin';const {GET}=await import('../src/app/api/documente/[id]/route');expect((await GET(new Request('http://local'),{params:Promise.resolve({id:doc})})).status).toBe(404);
    expect((await q('SELECT deletion_error,deletion_attempts FROM documents WHERE id=$1',[doc]))[0]).toMatchObject({deletion_error:'EACCES',deletion_attempts:1});
    expect((await q('SELECT status FROM privacy_requests WHERE id=$1',[id]))[0].status).toBe('processing');
    await expect(s.privacyDecision('demo-admin',id,true,reason)).resolves.toMatchObject({status:'processing'});
    await q('UPDATE documents SET retry_at=now() WHERE id=$1',[doc]);const retry=await maintenance.runMaintenance(q);expect(retry.deleted).toBe(1);
    expect((await q('SELECT status,outcome FROM privacy_requests WHERE id=$1',[id]))[0]).toMatchObject({status:'completed',outcome:{action:'account_erased'}});
    await expect(access(path.join(dir,'private-documents',doc))).rejects.toThrow();
    expect((await maintenance.runMaintenance(q)).deleted).toBe(0);
    await expect(s.privacyDecision('demo-admin',id,true,reason)).resolves.toMatchObject({status:'completed'});
  });
  it('expires and purges evidence from an unattended scheduled tick',async()=>{
    const doc=await proof('demo-student');await q("UPDATE documents SET created_at=now()-interval '31 days' WHERE id=$1",[doc]);
    await q("INSERT INTO checks(id,user_id,kind,document_id,academic_year,created_at) VALUES('expired','demo-student','school',$1,'2025–2026',now()-interval '31 days')",[doc]);
    await new Promise<void>((resolve,reject)=>{
      maintenance.startRetentionJob(async()=>{try{await maintenance.runMaintenance(q);resolve();}catch(e){reject(e);}},100);
    });maintenance.stopRetentionJob();
    expect((await q("SELECT status FROM checks WHERE id='expired'"))[0].status).toBe('expired');
    expect((await q('SELECT deleted_at FROM documents WHERE id=$1',[doc]))[0].deleted_at).not.toBeNull();
    expect((await q("SELECT status FROM maintenance_runs ORDER BY started_at DESC LIMIT 1"))[0].status).toBe('completed');
  });
  it('keeps recent report resolutions and scrubs decision text after its retention period',async()=>{
    await s.report('demo-student','review-0','Retained recent report reason');
    await s.report('demo-student','review-1','Expired report reason');
    await q("UPDATE reports SET status='resolved',resolution='Recent decision',resolved_at=now(),created_at=now()-interval '60 days' WHERE review_id='review-0'");
    await q("UPDATE reports SET status='resolved',resolution='Expired decision',resolved_at=now()-interval '31 days' WHERE review_id='review-1'");
    await maintenance.runMaintenance(q);
    expect((await q("SELECT reason,resolution FROM reports WHERE review_id='review-0'"))[0]).toMatchObject({reason:'Retained recent report reason',resolution:'Recent decision'});
    expect((await q("SELECT reason,resolution FROM reports WHERE review_id='review-1'"))[0]).toMatchObject({reason:'Conținut eliminat.',resolution:null});
  });
});
describe('P1 reply versioning',()=>{
  it('clears approved and pending replies on an edit, rejecting a stale staff decision',async()=>{
    const id=await s.saveReview('demo-student',input);await s.moderateReview('demo-admin',id,true,reason);
    await s.reply('demo-teacher',id,'Primul răspuns pentru conținutul inițial.');
    let reply=(await q('SELECT * FROM reviews WHERE id=$1',[id]))[0];await s.moderateReply('demo-admin',id,true,reason,reply.version,reply.reply_pending_id);
    await s.reply('demo-teacher',id,'Un răspuns nou în așteptarea moderării.');reply=(await q('SELECT * FROM reviews WHERE id=$1',[id]))[0];
    await s.saveReview('demo-student',{...input,body:input.body+' Experiența a fost actualizată.'});
    expect((await q('SELECT reply,reply_pending,version FROM reviews WHERE id=$1',[id]))[0]).toMatchObject({reply:null,reply_pending:null,version:2});
    await s.moderateReview('demo-admin',id,true,reason);
    await expect(s.moderateReply('demo-admin',id,true,reason,reply.version,reply.reply_pending_id)).rejects.toThrow('modificat');
  });
  it('rejects replacement replies even when the review version is unchanged',async()=>{
    await s.reply('demo-teacher','review-0','Răspunsul pe care moderatorul îl vede.');const old=(await q("SELECT * FROM reviews WHERE id='review-0'"))[0];
    await s.reply('demo-teacher','review-0','Răspuns înlocuit după deschiderea formularului.');
    await expect(s.moderateReply('demo-admin','review-0',true,reason,old.version,old.reply_pending_id)).rejects.toThrow('modificat');
  });
});
