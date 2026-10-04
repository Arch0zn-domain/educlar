import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Query, Row } from './db';
import { ensure } from './domain';

export type Fulfillment = {subject_id?:string;correction_target?:string;correction_field?:string;correction_value?:string;content_type?:string;content_id?:string};
const value=z.string().trim().min(1).max(2000);
export async function exportPersonalData(q:Query,subject:string) {
  const user=(await q('SELECT id,name,email,phone_number,created_at FROM auth_user WHERE id=$1',[subject]))[0];ensure(user,'Contul verificat nu există.');
  return {
    generated_at:new Date().toISOString(),user,
    profile:(await q('SELECT role,age_band,pseudonym,terms_version,terms_accepted_at,disabled FROM profiles WHERE user_id=$1',[subject]))[0]||null,
    alumni:(await q('SELECT public_name,school_id,graduation,university,field,bio,published FROM alumni WHERE user_id=$1',[subject]))[0]||null,
    // Include only the subject's content, never third-party identities, tokens or evidence bytes.
    reviews:await q('SELECT id,teacher_id,context,academic_year,body,clarity,respect,fairness,feedback,status FROM reviews WHERE author_id=$1',[subject]),
    replies:await q('SELECT id,CASE WHEN reply_author_id=$1 THEN reply ELSE NULL END AS reply,CASE WHEN reply_author_id=$1 THEN reply_version ELSE NULL END AS reply_version,CASE WHEN reply_pending_author_id=$1 THEN reply_pending ELSE NULL END AS reply_pending FROM reviews WHERE reply_author_id=$1 OR reply_pending_author_id=$1',[subject]),
    requests:await q('SELECT id,offer_id,message,status,created_at FROM requests WHERE user_id=$1',[subject]),
    reports:await q('SELECT id,review_id,reason,status FROM reports WHERE user_id=$1',[subject]),
    checks:await q('SELECT id,kind,school_id,teacher_id,context,academic_year,details,reason,status,created_at,decided_at FROM checks WHERE user_id=$1',[subject]),
    teacher_profiles:await q('SELECT id,name,subjects,bio,start_year,experience_confirmed,withdrawn FROM teachers WHERE claimed_by=$1',[subject]),
    offers:await q('SELECT o.id,o.teacher_id,o.subject,o.level,o.format,o.city,o.duration,o.price,o.active FROM offers o JOIN teachers t ON t.id=o.teacher_id WHERE t.claimed_by=$1',[subject]),
    sessions:await q('SELECT created_at,updated_at,expires_at,ip_address,user_agent FROM auth_session WHERE user_id=$1',[subject]),
    privacy_requests:await q('SELECT id,kind,contact,message,status,outcome,response,created_at,completed_at FROM privacy_requests WHERE user_id=$1 OR subject_id=$1',[subject]),
    documents:await q('SELECT id,mime,created_at,deleted_at,deletion_requested_at FROM documents WHERE owner_id=$1',[subject]),
    family_links:await q('SELECT id,status,parent_consented,(parent_id=$1) AS is_parent,(child_id=$1) AS is_child FROM families WHERE parent_id=$1 OR child_id=$1',[subject]),
  };
}
export async function privacyExport(q:Query,userId:string,requestId:string) {
  const request=(await q("SELECT subject_id,export_data FROM privacy_requests WHERE id=$1 AND kind='access' AND status='completed' AND export_expires_at>now()",[requestId]))[0];
  const p=(await q('SELECT disabled,staff_role FROM profiles WHERE user_id=$1',[userId]))[0];
  ensure(request?.export_data&&p&&!p.disabled&&(request.subject_id===userId||p.staff_role==='admin'),'Export indisponibil.');
  return request.export_data;
}
export async function withdrawTeacher(q:Query,teacherId:string) {
  const t=(await q('SELECT source_key FROM teachers WHERE id=$1',[teacherId]))[0];ensure(t,'Selectează profilul vizat.');
  await q('INSERT INTO suppressions(source_key) VALUES($1) ON CONFLICT DO NOTHING',[t.source_key]);
  await q("UPDATE teachers SET withdrawn=true,name='Profil retras',bio='',subjects='[]',start_year=NULL,experience_confirmed=false,claimed_by=NULL WHERE id=$1",[teacherId]);
  await q('UPDATE offers SET active=false WHERE teacher_id=$1',[teacherId]);
  await q("UPDATE reviews SET status='rejected',body='Conținut retras.',reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE teacher_id=$1",[teacherId]);
  await q("UPDATE requests SET status='cancelled' WHERE offer_id IN(SELECT id FROM offers WHERE teacher_id=$1)",[teacherId]);
}
async function eraseAccount(q:Query,subject:string,actor:string) {
  ensure(subject!==actor,'Administratorul activ nu se poate șterge aici.');
  const p=(await q('SELECT staff_role FROM profiles WHERE user_id=$1',[subject]))[0];ensure(p&&!p.staff_role,'Conturile administrative necesită revocarea separată a accesului.');
  const old=(await q('SELECT email,phone_number FROM auth_user WHERE id=$1',[subject]))[0];
  // Moderation logs can duplicate the reasons/content being erased. Keep the
  // operation record, but remove its free text before ownership links disappear.
  await q(`UPDATE audit SET actor_id=CASE WHEN actor_id=$1 THEN NULL ELSE actor_id END,reason='Date personale eliminate.'
    WHERE actor_id=$1 OR target_id=$1 OR target_id IN(
      SELECT id FROM checks WHERE user_id=$1 UNION SELECT id FROM reports WHERE user_id=$1
      UNION SELECT id FROM requests WHERE user_id=$1 UNION SELECT id FROM privacy_requests WHERE user_id=$1 OR subject_id=$1
      UNION SELECT id FROM families WHERE parent_id=$1 OR child_id=$1 OR created_by=$1
      UNION SELECT id FROM reviews WHERE author_id=$1 OR reply_author_id=$1 OR reply_pending_author_id=$1
        OR teacher_id IN(SELECT id FROM teachers WHERE claimed_by=$1))`,[subject]);
  const families=await q('SELECT id,child_id FROM families WHERE parent_id=$1 OR child_id=$1',[subject]);
  for(const f of families) {
    await q("UPDATE families SET status='revoked',parent_consented=false,label='Legătură retrasă',invited_phone=NULL WHERE id=$1",[f.id]);
    await q("UPDATE reviews SET status='rejected',reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE family_id=$1",[f.id]);
    await q("UPDATE requests SET status='cancelled' WHERE family_id=$1",[f.id]);
    if(f.child_id)await q('DELETE FROM auth_session WHERE user_id=$1',[f.child_id]);
  }
  await q('DELETE FROM auth_session WHERE user_id=$1',[subject]);await q('DELETE FROM auth_account WHERE user_id=$1',[subject]);
  if(old.phone_number)await q('DELETE FROM auth_verification WHERE position($1 in identifier)>0',[old.phone_number]);
  await q('DELETE FROM auth_verification WHERE position($1 in identifier)>0',[old.email]);
  await q("UPDATE profiles SET disabled=true,pseudonym='Cont șters',role='student',age_band='adult',terms_version=NULL,terms_accepted_at=NULL WHERE user_id=$1",[subject]);
  await q("UPDATE auth_user SET name='Cont șters',email=$1,email_verified=false,phone_number=NULL,phone_number_verified=false,image=NULL WHERE id=$2",[`${randomUUID()}@deleted.invalid`,subject]);
  // Legacy replies are also covered before the ownership link is removed.
  await q('UPDATE reviews SET reply=NULL,reply_author_id=NULL,reply_version=NULL WHERE reply_author_id=$1 OR teacher_id IN(SELECT id FROM teachers WHERE claimed_by=$1)',[subject]);
  await q('UPDATE reviews SET reply_pending=NULL,reply_pending_author_id=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE reply_pending_author_id=$1 OR teacher_id IN(SELECT id FROM teachers WHERE claimed_by=$1)',[subject]);
  await q("UPDATE reviews SET status='rejected',body='Conținut retras.',reason=NULL,reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE author_id=$1",[subject]);
  await q("UPDATE reports SET status='resolved',reason='Conținut eliminat.',resolution=NULL,resolved_at=now() WHERE user_id=$1",[subject]);
  await q("UPDATE checks SET status='expired',details='{}',reason=NULL,decided_at=now() WHERE user_id=$1",[subject]);
  await q("UPDATE requests SET status='cancelled',message='Conținut retras.' WHERE user_id=$1",[subject]);
  await q('DELETE FROM alumni WHERE user_id=$1',[subject]);
  await q('UPDATE offers SET active=false WHERE teacher_id IN(SELECT id FROM teachers WHERE claimed_by=$1)',[subject]);
  await q("UPDATE teachers SET claimed_by=NULL,bio='' WHERE claimed_by=$1",[subject]);
  await q('UPDATE documents SET deletion_requested_at=coalesce(deletion_requested_at,now()),retry_at=NULL WHERE owner_id=$1 AND deleted_at IS NULL',[subject]);
  await q("UPDATE privacy_requests SET contact='Contact eliminat',message='Conținut eliminat.',reason=NULL,response=NULL,export_data=NULL,export_expires_at=NULL WHERE user_id=$1 OR subject_id=$1",[subject]);
  await q('DELETE FROM rate_limits WHERE key=$1 OR key=$2',[`request:${subject}`,`report:${subject}`]);
}
async function correctData(q:Query,subject:string,request:Row,input:Fulfillment) {
  const target=z.enum(['account','alumni','teacher']).parse(input.correction_target);
  const field=value.parse(input.correction_field),raw=value.parse(input.correction_value);
  const fields:Record<string,Record<string,z.ZodType>>={account:{name:z.string().min(2).max(120)},alumni:{public_name:z.string().min(2).max(100),university:z.string().min(2).max(150),field:z.string().min(2).max(100),bio:z.string().min(20).max(1500),graduation:z.coerce.number().int().min(1950).max(new Date().getFullYear())},teacher:{name:z.string().min(3).max(120),bio:z.string().min(20).max(2000),start_year:z.coerce.number().int().min(1950).max(new Date().getFullYear())}};
  ensure(Object.hasOwn(fields[target],field),'Acest câmp nu poate fi corectat prin această operație.');
  const corrected=fields[target][field].parse(raw);
  const table=target==='account'?'auth_user':target==='alumni'?'alumni':'teachers';
  const column=target==='account'?'id':target==='alumni'?'user_id':'claimed_by';
  const suffix=target==='teacher'?' AND id=$3 AND NOT withdrawn':'';
  const params=target==='teacher'?[corrected,subject,request.teacher_id]:[corrected,subject];
  const timestamps=target==='alumni'?'':',updated_at=now()';
  const verified=target==='teacher'&&field==='start_year'?',experience_confirmed=true':'';
  // Identifiers are selected from fixed allowlists; values stay parameterized.
  const rows=await q(`UPDATE ${table} SET ${field}=$1${timestamps}${verified} WHERE ${column}=$2${suffix} RETURNING ${column}`,params);
  ensure(rows.length===1,'Datele vizate nu aparțin contului verificat.');
  return {action:'data_corrected',target,field};
}
async function removeContent(q:Query,input:Fulfillment,reason:string) {
  const type=z.enum(['review','reply','offer','alumni']).parse(input.content_type),id=value.parse(input.content_id);
  let rows:Row[]=[];
  if(type==='review')rows=await q("UPDATE reviews SET status='rejected',body='Conținut retras.',reason=$1,reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE id=$2 RETURNING id",[reason,id]);
  if(type==='reply')rows=await q('UPDATE reviews SET reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL WHERE id=$1 AND (reply IS NOT NULL OR reply_pending IS NOT NULL) RETURNING id',[id]);
  if(type==='offer')rows=await q('UPDATE offers SET active=false WHERE id=$1 RETURNING id',[id]);
  if(type==='alumni')rows=await q('UPDATE alumni SET published=false WHERE user_id=$1 RETURNING user_id',[id]);
  ensure(rows.length===1,'Conținutul vizat nu există.');return {action:'content_removed',target:type,target_id:id};
}
export async function fulfillPrivacy(q:Query,actor:string,r:Row,reason:string,input:Fulfillment={}) {
  let outcome:Record<string,unknown>,status='completed';const subject=r.user_id||input.subject_id;
  if(r.kind==='access'||r.kind==='correction'||r.kind==='account')ensure(subject&&(await q('SELECT id FROM auth_user WHERE id=$1',[subject])).length,'Asociază solicitarea cu un cont verificat.');
  if(r.kind==='access') {
    const data=await exportPersonalData(q,subject);
    await q("UPDATE privacy_requests SET export_data=$1,export_expires_at=now()+interval '7 days' WHERE id=$2",[JSON.stringify(data),r.id]);
    outcome={action:'export_generated'};
  } else if(r.kind==='correction')outcome=await correctData(q,subject,r,input);
  else if(r.kind==='illegal')outcome=await removeContent(q,input,reason);
  else if(r.kind==='profile') {ensure(r.teacher_id,'Selectează profilul vizat.');await withdrawTeacher(q,r.teacher_id);outcome={action:'profile_withdrawn',target_id:r.teacher_id};}
  else {await eraseAccount(q,subject,actor);const remaining=await q('SELECT id FROM documents WHERE owner_id=$1 AND deleted_at IS NULL',[subject]);status=remaining.length?'processing':'completed';outcome={action:status==='processing'?'account_erasure_awaiting_files':'account_erased'};}
  await q("UPDATE privacy_requests SET subject_id=$1,status=$2,reason=$3,response=$3,outcome=$4,completed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END WHERE id=$5",[subject||null,status,r.kind==='account'?'Ștergerea contului a fost înregistrată.':reason,JSON.stringify(outcome),r.id]);
  return {status,outcome};
}
