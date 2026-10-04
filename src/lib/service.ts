import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Query, Row } from './db';
import { ensure, pseudonym } from './domain';
import { legal } from './legal';
import { fulfillPrivacy, type Fulfillment } from './privacy';

const year = z.string().regex(/^20\d{2}[–-]20\d{2}$/).transform(s=>s.replace('-','–'));
const text = (min=1,max=2000) => z.string().trim().min(min).max(max);
export class Service {
  constructor(public q: Query) {}
  async actor(id: string) {
    const p = (await this.q('SELECT p.*,u.name,u.phone_number FROM profiles p JOIN auth_user u ON u.id=p.user_id WHERE user_id=$1',[id]))[0];
    ensure(p && !p.disabled,'Completează profilul sau verifică starea contului.'); return p;
  }
  async staff(id: string, admin=false) { const p=await this.actor(id); ensure(admin?p.staff_role==='admin':!!p.staff_role,'Nu ai permisiunea necesară.'); return p; }
  async audit(actor: string|null, action: string, target: string, reason: string) { await this.q('INSERT INTO audit(id,actor_id,action,target_id,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,action,target,reason]); }
  async limit(key:string,max=10,seconds=3600) {
    const row=(await this.q("INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count",[key,seconds]))[0];
    ensure(row.count<=max,'Ai trimis prea multe solicitări. Încearcă mai târziu.');
  }
  async onboard(id:string,input:unknown) {
    const v=z.object({role:z.enum(['student','parent','teacher','alumni']),age_band:z.enum(['under16','16to17','adult']),accept_terms:z.literal('yes'),terms_version:z.literal(legal.version)}).parse(input);
    ensure(v.role==='student'||v.age_band==='adult','Rolul selectat necesită un cont de adult.');
    ensure(!(await this.q('SELECT user_id FROM profiles WHERE user_id=$1',[id])).length,'Profilul există deja. Modificările de identitate se verifică prin administrator.');
    await this.q('INSERT INTO profiles(user_id,role,age_band,pseudonym,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,now())',[id,v.role,v.age_band,pseudonym(id),v.terms_version]);
  }
  async subject(id:string,familyId?:string) {
    const p=await this.actor(id);
    const families=await this.q('SELECT * FROM families WHERE ($2::text IS NULL AND child_id=$1) OR (id=$2 AND (parent_id=$1 OR child_id=$1))',[id,familyId||null]);
    const f=families[0];
    if(p.age_band==='under16'||familyId||p.role==='parent') {
      ensure(f && f.status==='approved' && f.parent_consented,'Este necesară o legătură de tutelă verificată și activă.');
    }
    if(f) ensure(f.status==='approved'&&f.parent_consented,'Autorizarea tutorelui nu este activă.');
    return {p,f,key:f?`family:${f.id}`:`user:${id}`};
  }
  async eligible(id:string,teacherId:string,context:string,academicYear:string,familyId?:string) {
    const {p,f,key}=await this.subject(id,familyId);
    const t=(await this.q('SELECT * FROM teachers WHERE id=$1 AND NOT withdrawn',[teacherId]))[0];
    ensure(t,'Profesorul nu este disponibil.'); ensure(t.claimed_by!==id,'Nu poți evalua propriul profil.');
    const owners=f?[f.parent_id,f.child_id].filter(Boolean):[id];
    const verified=await this.q("SELECT * FROM checks WHERE user_id=ANY($1::text[]) AND status='approved' AND academic_year=$2 AND (family_id=$3 OR ($3::text IS NULL AND family_id IS NULL))",[owners,academicYear,f?.id||null]);
    const relationship=verified.find(c=>c.kind==='relationship'&&c.teacher_id===teacherId&&c.context===context);
    ensure(relationship,'Verifică mai întâi relația cu profesorul pentru contextul și anul selectate.');
    if(context==='class') ensure(verified.some(c=>c.kind==='school'&&c.school_id===relationship.school_id),'Este necesară și verificarea apartenenței școlare pentru același an și aceeași școală.');
    return {p,f,key};
  }
  async family(id:string,input:unknown) {
    const p=await this.actor(id);
    const v=z.object({label:text(2,80),school_id:text(),parent_phone:z.string().optional()}).parse(input);
    ensure((await this.q('SELECT id FROM schools WHERE id=$1',[v.school_id])).length,'Școală invalidă.');
    const fid=randomUUID();
    if(p.role==='parent'&&p.age_band==='adult') {
      await this.q("INSERT INTO families(id,parent_id,label,school_id,created_by,status,parent_consented) VALUES($1,$2,$3,$4,$2,'pending',true)",[fid,id,v.label,v.school_id]);
    } else {
      ensure(p.role==='student','Doar elevii și părinții pot crea o legătură de tutelă.');
      ensure(/^\+[1-9]\d{7,14}$/.test(v.parent_phone||'')&&v.parent_phone!==p.phone_number,'Introdu telefonul tutorelui în format internațional.');
      ensure(!(await this.q('SELECT id FROM families WHERE child_id=$1',[id])).length,'Există deja o legătură pentru acest cont. Solicită corectarea prin administrator.');
      await this.q("INSERT INTO families(id,child_id,invited_phone,label,school_id,created_by,status) VALUES($1,$2,$3,$4,$5,$2,'invited')",[fid,id,v.parent_phone,v.label,v.school_id]);
    }
    return fid;
  }
  async acceptFamily(id:string,fid:string) {
    const p=await this.actor(id); ensure(p.role==='parent'&&p.age_band==='adult','Este necesar un cont de părinte adult.');
    const f=(await this.q('SELECT * FROM families WHERE id=$1',[fid]))[0];
    ensure(f&&f.status==='invited'&&f.invited_phone===p.phone_number,'Invitația nu îți aparține.');
    await this.q("UPDATE families SET parent_id=$1,parent_consented=true,status='pending',invited_phone=NULL WHERE id=$2",[id,fid]);
  }
  async revokeFamily(id:string,fid:string) {
    const f=(await this.q('SELECT * FROM families WHERE id=$1 AND parent_id=$2',[fid,id]))[0]; ensure(f,'Legătură indisponibilă.');
    await this.q("UPDATE families SET status='revoked',parent_consented=false WHERE id=$1",[fid]);
    await this.q("UPDATE reviews SET status='rejected',reason='Autorizarea tutorelui a fost retrasă.' WHERE family_id=$1",[fid]);
    await this.q("UPDATE requests SET status='cancelled' WHERE family_id=$1",[fid]);
    if(f.child_id) await this.q('DELETE FROM auth_session WHERE user_id=$1',[f.child_id]);
    await this.audit(id,'guardian.revoke',fid,'Autorizare retrasă de părinte.');
  }
  async submitCheck(id:string,input:unknown,documentId:string) {
    const p=await this.actor(id);
    const v=z.object({kind:z.enum(['school','relationship','claim','guardian','correction']),school_id:z.string().optional(),teacher_id:z.string().optional(),family_id:z.string().optional(),context:z.enum(['class','tutoring']).default('class'),academic_year:year,details:z.record(z.string(),z.unknown()).default({})}).parse(input);
    ensure((await this.q('SELECT id FROM documents WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[documentId,id])).length,'Dovadă indisponibilă.');
    if(v.kind==='guardian') {
      const f=(await this.q("SELECT id FROM families WHERE id=$1 AND parent_id=$2 AND status='pending' AND parent_consented",[v.family_id,id]))[0]; ensure(f&&p.age_band==='adult','Acceptă mai întâi legătura de tutelă.');
    } else if(v.kind==='claim'||v.kind==='correction') {
      ensure(p.role==='teacher'&&p.age_band==='adult','Este necesar un cont de profesor adult.');
      const t=(await this.q('SELECT * FROM teachers WHERE id=$1 AND NOT withdrawn',[v.teacher_id]))[0]; ensure(t,'Profesor indisponibil.');
      ensure(v.kind==='claim'?!t.claimed_by:t.claimed_by===id,'Profilul nu poate fi revendicat sau modificat de acest cont.');
      if(v.kind==='correction') v.details=z.object({name:text(3,120),subject:text(2,80),school_id:text(),start_year:z.coerce.number().int().min(1950).max(new Date().getFullYear())}).parse(v.details);
    } else {
      const {f}=await this.subject(id,v.family_id); v.family_id=f?.id;
      ensure(!!v.school_id,'Selectează instituția.');
      if(v.kind==='relationship') {
        ensure(!!v.teacher_id,'Selectează profesorul.');
        if(v.context==='class') ensure((await this.q('SELECT teacher_id FROM affiliations WHERE teacher_id=$1 AND school_id=$2',[v.teacher_id,v.school_id])).length,'Profesorul nu este asociat școlii selectate.');
      }
    }
    const checkId=randomUUID();
    await this.q('INSERT INTO checks(id,user_id,kind,school_id,teacher_id,family_id,context,academic_year,document_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[checkId,id,v.kind,v.school_id||null,v.teacher_id||null,v.family_id||null,v.context,v.academic_year,documentId,JSON.stringify(v.details)]);
    return checkId;
  }
  async decideCheck(actorId:string,id:string,approve:boolean,reason:string) {
    await this.staff(actorId,true); text(5,1000).parse(reason);
    const c=(await this.q("SELECT * FROM checks WHERE id=$1 AND status='pending'",[id]))[0]; ensure(c,'Cerere deja soluționată.');
    if(approve) {
      if(c.kind==='claim') {
        const owned=await this.q('UPDATE teachers SET claimed_by=$1,updated_at=now() WHERE id=$2 AND claimed_by IS NULL AND NOT withdrawn RETURNING id',[c.user_id,c.teacher_id]); ensure(owned.length,'Profilul a fost deja revendicat sau retras.');
      }
      if(c.kind==='guardian') {
        const f=await this.q("UPDATE families SET status='approved' WHERE id=$1 AND parent_id=$2 AND parent_consented AND status='pending' RETURNING id",[c.family_id,c.user_id]); ensure(f.length,'Tutela nu mai poate fi aprobată.');
      }
      if(c.kind==='correction') {
        const d=z.object({name:text(3,120),subject:text(2,80),school_id:text(),start_year:z.coerce.number().int().min(1950).max(new Date().getFullYear())}).parse(c.details);
        ensure((await this.q('SELECT id FROM schools WHERE id=$1',[d.school_id])).length,'Instituție invalidă.');
        ensure((await this.q('SELECT id FROM teachers WHERE id=$1 AND claimed_by=$2 AND NOT withdrawn',[c.teacher_id,c.user_id])).length,'Revendicarea nu mai este activă.');
        await this.q('UPDATE teachers SET name=$1,subjects=$2,start_year=$3,experience_confirmed=true,updated_at=now() WHERE id=$4',[d.name,JSON.stringify([d.subject]),d.start_year,c.teacher_id]);
        await this.q('DELETE FROM affiliations WHERE teacher_id=$1',[c.teacher_id]);
        await this.q('INSERT INTO affiliations(teacher_id,school_id) VALUES($1,$2)',[c.teacher_id,d.school_id]);
      }
    }
    await this.q('UPDATE checks SET status=$1,reason=$2,decided_at=now() WHERE id=$3',[approve?'approved':'rejected',reason,id]);
    await this.audit(actorId,`check.${approve?'approve':'reject'}`,id,reason);
  }
  async saveReview(id:string,input:unknown) {
    const v=z.object({teacher_id:text(),family_id:z.string().optional(),context:z.enum(['class','tutoring']),academic_year:year,body:text(40,2000),clarity:z.coerce.number().int().min(1).max(5),respect:z.coerce.number().int().min(1).max(5),fairness:z.coerce.number().int().min(1).max(5),feedback:z.coerce.number().int().min(1).max(5)}).parse(input);
    const {p,f,key}=await this.eligible(id,v.teacher_id,v.context,v.academic_year,v.family_id);
    const existing=(await this.q('SELECT * FROM reviews WHERE subject_key=$1 AND teacher_id=$2 AND context=$3 AND academic_year=$4',[key,v.teacher_id,v.context,v.academic_year]))[0];
    ensure(!existing||existing.author_id===id,'Familia are deja o recenzie pentru această experiență.');
    const rid=existing?.id||randomUUID(),status=p.age_band==='under16'?'guardian_pending':'pending';
    if(existing) await this.q('UPDATE reviews SET body=$1,clarity=$2,respect=$3,fairness=$4,feedback=$5,status=$6,reason=NULL,version=version+1,reply=NULL,reply_pending=NULL,reply_author_id=NULL,reply_pending_author_id=NULL,reply_version=NULL,reply_pending_version=NULL,reply_pending_id=NULL,updated_at=now() WHERE id=$7',[v.body,v.clarity,v.respect,v.fairness,v.feedback,status,rid]);
    else await this.q('INSERT INTO reviews(id,author_id,teacher_id,family_id,subject_key,context,academic_year,body,clarity,respect,fairness,feedback,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[rid,id,v.teacher_id,f?.id||null,key,v.context,v.academic_year,v.body,v.clarity,v.respect,v.fairness,v.feedback,status]);
    return rid;
  }
  async guardianDecision(id:string,kind:'review'|'request',target:string,approve:boolean) {
    await this.actor(id); const table=kind==='review'?'reviews':'requests';
    const item=(await this.q(`SELECT x.*,f.parent_id,f.status AS family_status,f.parent_consented FROM ${table} x JOIN families f ON f.id=x.family_id WHERE x.id=$1`,[target]))[0];
    ensure(item&&item.parent_id===id&&item.family_status==='approved'&&item.parent_consented&&item.status==='guardian_pending','Solicitarea nu poate fi autorizată.');
    await this.q(`UPDATE ${table} SET status=$1 WHERE id=$2`,[approve?'pending':kind==='review'?'rejected':'cancelled',target]);
    await this.audit(id,'guardian.decision',target,approve?'Autorizat de tutore.':'Refuzat de tutore.');
  }
  async moderateReview(id:string,rid:string,approve:boolean,reason:string) {
    await this.staff(id); text(5,1000).parse(reason);
    const r=(await this.q('SELECT * FROM reviews WHERE id=$1',[rid]))[0]; ensure(r&&r.status!=='guardian_pending','Recenzie indisponibilă sau neautorizată de tutore.');
    if(approve) await this.eligible(r.author_id,r.teacher_id,r.context,r.academic_year,r.family_id||undefined);
    await this.q('UPDATE reviews SET status=$1,reason=$2 WHERE id=$3',[approve?'approved':'rejected',reason,rid]);
    await this.audit(id,'review.moderate',rid,reason);
  }
  async report(id:string,rid:string,reason:string) {
    const p=await this.actor(id); if(p.age_band==='under16') await this.subject(id); text(10,1000).parse(reason);
    ensure((await this.q("SELECT r.id FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.id=$1 AND r.status='approved' AND NOT t.withdrawn",[rid])).length,'Recenzie indisponibilă.');
    await this.limit(`report:${id}`,5,86400);
    await this.q('INSERT INTO reports(id,user_id,review_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,review_id) DO NOTHING',[randomUUID(),id,rid,reason]);
  }
  async reply(id:string,rid:string,body:string) {
    await this.actor(id); text(10,1500).parse(body);
    ensure((await this.q("SELECT r.id FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.id=$1 AND t.claimed_by=$2 AND NOT t.withdrawn AND r.status='approved'",[rid,id])).length,'Nu poți răspunde acestei recenzii.');
    await this.q('UPDATE reviews SET reply_pending=$1,reply_pending_author_id=$2,reply_pending_version=version,reply_pending_id=$3 WHERE id=$4',[body,id,randomUUID(),rid]);
  }
  async offer(id:string,input:unknown) {
    const p=await this.actor(id); ensure(p.role==='teacher','Este necesar un cont de profesor.');
    const v=z.object({subject:text(2,80),level:text(2,120),format:z.enum(['online','fizic','mixt']),city:text(2,100),duration:z.coerce.number().int().min(30).max(240),price:z.coerce.number().int().min(0).max(10000),bio:text(20,2000)}).parse(input);
    const t=(await this.q('SELECT * FROM teachers WHERE claimed_by=$1 AND NOT withdrawn',[id]))[0]; ensure(t,'Revendică și verifică profilul înainte să oferi meditații.');
    ensure(t.subjects.includes(v.subject),'Oferta trebuie să corespundă unei materii verificate.');
    await this.q('UPDATE teachers SET bio=$1,updated_at=now() WHERE id=$2',[v.bio,t.id]);
    await this.q('INSERT INTO offers(id,teacher_id,subject,level,format,city,duration,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(teacher_id,subject,level) DO UPDATE SET format=excluded.format,city=excluded.city,duration=excluded.duration,price=excluded.price,active=true',[randomUUID(),t.id,v.subject,v.level,v.format,v.city,v.duration,v.price]);
  }
  async request(id:string,input:unknown) {
    const v=z.object({offer_id:text(),family_id:z.string().optional(),message:text(20,1500),not_current_teacher:z.literal('yes')}).parse(input);
    const p=await this.actor(id); const {f}=p.age_band==='under16'||v.family_id?await this.subject(id,v.family_id):{f:undefined};
    ensure((await this.q('SELECT o.id FROM offers o JOIN teachers t ON t.id=o.teacher_id WHERE o.id=$1 AND o.active AND NOT t.withdrawn AND t.claimed_by IS NOT NULL AND t.claimed_by<>$2',[v.offer_id,id])).length,'Oferta nu este disponibilă.');
    await this.limit(`request:${id}`,10,86400);
    const rid=randomUUID();
    await this.q('INSERT INTO requests(id,offer_id,user_id,family_id,message,status) VALUES($1,$2,$3,$4,$5,$6)',[rid,v.offer_id,id,f?.id||null,v.message,p.age_band==='under16'?'guardian_pending':'pending']); return rid;
  }
  async requestDecision(id:string,rid:string,accept:boolean) {
    await this.actor(id);
    const r=(await this.q('SELECT r.*,t.claimed_by FROM requests r JOIN offers o ON o.id=r.offer_id JOIN teachers t ON t.id=o.teacher_id WHERE r.id=$1 AND NOT t.withdrawn AND o.active',[rid]))[0];
    ensure(r&&r.claimed_by===id&&r.status==='pending','Cerere indisponibilă.');
    if(r.family_id) await this.subject(r.user_id,r.family_id);
    await this.q('UPDATE requests SET status=$1 WHERE id=$2',[accept?'accepted':'declined',rid]);
  }
  async alumni(id:string,input:unknown) {
    const p=await this.actor(id); ensure(p.age_band==='adult','Profilul public de absolvent este disponibil adulților.');
    const v=z.object({public_name:text(2,100),school_id:text(),graduation:z.coerce.number().int().min(1950).max(new Date().getFullYear()),university:text(2,150),field:text(2,100),bio:text(20,1500),published:z.boolean()}).parse(input);
    await this.q('INSERT INTO alumni(user_id,public_name,school_id,graduation,university,field,bio,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET public_name=excluded.public_name,school_id=excluded.school_id,graduation=excluded.graduation,university=excluded.university,field=excluded.field,bio=excluded.bio,published=excluded.published',[id,v.public_name,v.school_id,v.graduation,v.university,v.field,v.bio,v.published]);
  }
  async privacy(id:string|null,input:unknown) {
    const v=z.object({kind:z.enum(['account','profile','illegal','access','correction']),teacher_id:z.string().optional(),contact:text(5,200),message:text(20,3000)}).parse(input);
    if(v.kind==='account') ensure(id,'Connectează-te pentru a asocia cererea de ștergere cu propriul cont.');
    if(v.kind==='profile') ensure(v.teacher_id&&(await this.q('SELECT id FROM teachers WHERE id=$1 AND NOT withdrawn',[v.teacher_id])).length,'Selectează profilul de profesor vizat.');
    const rid=randomUUID(); await this.q('INSERT INTO privacy_requests(id,user_id,kind,teacher_id,contact,message) VALUES($1,$2,$3,$4,$5,$6)',[rid,id,v.kind,v.teacher_id||null,v.contact,v.message]); return rid;
  }
  async moderateReply(id:string,rid:string,approve:boolean,reason:string,version:number,token:string) {
    await this.staff(id);text(5,1000).parse(reason);
    const rows=await this.q(`UPDATE reviews SET reply=CASE WHEN $1 THEN reply_pending ELSE reply END,
      reply_author_id=CASE WHEN $1 THEN reply_pending_author_id ELSE reply_author_id END,
      reply_version=CASE WHEN $1 THEN version ELSE reply_version END,
      reply_pending=NULL,reply_pending_author_id=NULL,reply_pending_version=NULL,reply_pending_id=NULL
      WHERE id=$2 AND status='approved' AND version=$3 AND reply_pending_version=$3 AND reply_pending_id=$4 AND reply_pending IS NOT NULL
      RETURNING id`,[approve,rid,version,token]);
    ensure(rows.length===1,'Răspunsul sau recenzia s-a modificat. Reîncarcă înainte de decizie.');
    await this.audit(id,'reply.moderate',rid,reason);
  }
  async privacyDecision(id:string,rid:string,approve:boolean,reason:string,input:Fulfillment={}) {
    await this.staff(id,true);text(10,2000).parse(reason);
    const r=(await this.q('SELECT * FROM privacy_requests WHERE id=$1',[rid]))[0];ensure(r,'Cerere indisponibilă.');
    if(['processing','completed'].includes(r.status)&&r.kind==='account'&&approve)return {status:r.status,outcome:r.outcome};
    ensure(r.status==='pending','Cerere deja soluționată.');
    if(!approve) {
      await this.q("UPDATE privacy_requests SET status='rejected',reason=$1,response=$1,outcome='{\"action\":\"rejected\"}',completed_at=now() WHERE id=$2",[reason,rid]);
      await this.audit(id,'privacy.reject',rid,reason);return {status:'rejected'};
    }
    const result=await fulfillPrivacy(this.q,id,r,reason,input);
    await this.audit(id,'privacy.fulfill',rid,r.kind==='account'?'Ștergere cont; detalii personale eliminate.':reason);
    return result;
  }
}
