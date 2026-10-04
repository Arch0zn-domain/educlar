import { query, serialized, type Row } from './db';
import { normalize, publicStatistics } from './domain';
import { Service } from './service';
import { purgeDocuments } from './documents';

export const catalog = (filters:Record<string,string|undefined>={}) => serialized(async()=> {
  const where=['s.active'],args:any[]=[];
  const add=(s:string,value:any)=>{args.push(value);where.push(s.replace('?',`$${args.length}`));};
  if(filters.q) add('s.search_text LIKE ?',`%${normalize(filters.q)}%`);
  if(filters.county) add('s.county=?',filters.county);
  if(filters.city) add('s.city=?',filters.city);
  if(filters.type) add('s.type=?',filters.type);
  if(filters.data==='official') where.push('NOT s.demo');
  if(filters.data==='demo') where.push('s.demo');
  const exam = ['BAC','EN','ADMITERE'].includes(filters.exam || '') ? filters.exam! : null;
  const requestedYear = Number(filters.year);
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= new Date().getFullYear() ? requestedYear : null;
  args.push(exam, year);
  const examParam = `$${args.length - 1}`, yearParam = `$${args.length}`;
  const period = `exam=coalesce(${examParam}::text,CASE WHEN s.type='gimnaziu' THEN 'EN' ELSE 'BAC' END) AND (${yearParam}::integer IS NULL OR year=${yearParam}::integer)`;
  where.push(`((${examParam}::text IS NULL AND ${yearParam}::integer IS NULL) OR EXISTS (SELECT 1 FROM statistics WHERE school_id=s.id AND ${period}))`);
  const count=(await query(`SELECT count(*)::int AS n FROM schools s WHERE ${where.join(' AND ')}`,args))[0].n;
  const page=Math.max(1,Math.min(Math.max(1,Math.ceil(count/24)),Math.floor(Number(filters.page))||1));
  const projection = exam === 'ADMITERE'
    ? `SELECT NULL::numeric AS mean,sum(candidates)::integer AS candidates,'{}'::jsonb AS distribution,false AS suppressed,year,session,exam,min(source_id) AS source_id,count(*)::integer AS specialization_count,min(minimum) AS minimum_low,max(minimum) AS minimum_high FROM statistics WHERE school_id=s.id AND ${period} GROUP BY year,session,exam ORDER BY year DESC,session LIMIT 1`
    : `SELECT mean,candidates,distribution,suppressed,year,session,exam,source_id,NULL::integer AS specialization_count,NULL::numeric AS minimum_low,NULL::numeric AS minimum_high FROM statistics WHERE school_id=s.id AND ${period} ORDER BY year DESC,session LIMIT 1`;
  const rows=await query(`SELECT s.*,src.title AS source_title,src.url AS source_url,st.mean AS average,st.year AS stat_year,st.session AS stat_session,st.exam AS stat_exam,ssrc.title AS stat_source_title,ssrc.url AS stat_source_url,st.candidates AS stat_candidates,st.distribution AS stat_distribution,st.suppressed AS stat_suppressed,st.specialization_count,st.minimum_low,st.minimum_high FROM schools s JOIN sources src ON src.id=s.source_id LEFT JOIN LATERAL (${projection}) st ON true LEFT JOIN sources ssrc ON ssrc.id=st.source_id WHERE ${where.join(' AND ')} ORDER BY s.demo,s.name LIMIT 24 OFFSET ${(page-1)*24}`,args);
  const schools:Row[]=rows.map(({stat_distribution,stat_suppressed,...school})=>({...school,average_suppressed:stat_suppressed,average:publicStatistics({candidates:school.stat_candidates,distribution:stat_distribution,suppressed:stat_suppressed,mean:school.average}).mean}));
  return {schools,count,page};
});
export const schoolOptions = () => serialized(()=>query<Row & {id:string;name:string;city:string}>('SELECT id,name,county,city,type,demo FROM schools WHERE active ORDER BY name'));
export const locations = () => serialized(()=>query('SELECT DISTINCT county,city FROM schools WHERE active ORDER BY county,city'));
export const catalogPeriods = () => serialized(()=>query<{year:number;exam:string}>('SELECT DISTINCT year,exam FROM statistics WHERE exam IN (\'BAC\',\'EN\') ORDER BY year DESC,exam'));
export const officialOverview = () => serialized(async()=>({
  schools:(await query('SELECT count(*)::int AS schools,count(DISTINCT county)::int AS counties FROM schools WHERE active AND NOT demo'))[0],
  periods:await query('SELECT year,exam,count(*)::int AS cohorts,sum(candidates)::bigint AS candidates,count(*) FILTER (WHERE suppressed)::int AS suppressed FROM statistics WHERE NOT demo GROUP BY year,exam ORDER BY year DESC,exam'),
  coverage:JSON.parse((await query("SELECT value FROM app_meta WHERE key='official-coverage'"))[0]?.value || 'null'),
}));
export const totals = () => serialized(async()=>({
  schools:Number((await query('SELECT count(*) AS n FROM schools WHERE active'))[0].n),official:Number((await query('SELECT count(*) AS n FROM schools WHERE active AND NOT demo'))[0].n),
  teachers:Number((await query('SELECT count(*) AS n FROM teachers WHERE NOT withdrawn'))[0].n),
}));
export const teachers = (filters:Record<string,string|undefined>={}) => serialized(async()=> {
  const rows=await query(`SELECT t.id,t.name,t.subjects,t.bio,t.start_year,t.experience_confirmed,t.demo,t.updated_at,(t.claimed_by IS NOT NULL) AS claimed,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'city',s.city,'county',s.county)) FROM affiliations a JOIN schools s ON s.id=a.school_id WHERE a.teacher_id=t.id),'[]') AS schools,
    (SELECT count(*)::int FROM reviews r WHERE r.teacher_id=t.id AND r.status='approved') AS review_count
    FROM teachers t WHERE NOT t.withdrawn ORDER BY t.name`);
  return rows.filter(t=>(!filters.q||normalize(`${t.name} ${t.subjects.join(' ')}`).includes(normalize(filters.q)))&&(!filters.subject||t.subjects.includes(filters.subject))&&(!filters.school||t.schools.some((s:Row)=>s.id===filters.school)));
});
export const schoolDetail = (id:string) => serialized(async()=> {
  const school=(await query('SELECT s.*,src.title AS source_title,src.url AS source_url FROM schools s JOIN sources src ON src.id=s.source_id WHERE s.id=$1',[id]))[0];
  if(!school) return null;
  const stats=(await query('SELECT st.*,src.title AS source_title,src.url AS source_url FROM statistics st JOIN sources src ON src.id=st.source_id WHERE school_id=$1 ORDER BY year DESC,exam',[id])).map(publicStatistics);
  const staff=await query('SELECT t.id,t.name,t.subjects,t.demo FROM teachers t JOIN affiliations a ON a.teacher_id=t.id WHERE a.school_id=$1 AND NOT t.withdrawn',[id]);
  const alumni=await query('SELECT a.public_name,a.graduation,a.university,a.field,a.bio FROM alumni a JOIN profiles p ON p.user_id=a.user_id WHERE a.school_id=$1 AND a.published AND p.age_band=\'adult\' AND NOT p.disabled',[id]);
  return {school,stats,staff,alumni};
});
export const teacherDetail = (id:string) => serialized(async()=> {
  const t=(await query('SELECT t.id,t.name,t.subjects,t.bio,t.start_year,t.experience_confirmed,t.demo,t.updated_at,(t.claimed_by IS NOT NULL) AS claimed,s.title AS source_title,s.url AS source_url FROM teachers t JOIN sources s ON s.id=t.source_id WHERE t.id=$1 AND NOT t.withdrawn',[id]))[0];
  if(!t) return null;
  const schools=await query('SELECT s.id,s.name,s.city FROM schools s JOIN affiliations a ON a.school_id=s.id WHERE a.teacher_id=$1',[id]);
  const reviews=await query("SELECT r.id,r.context,r.body,r.clarity,r.respect,r.fairness,r.feedback,r.reply,r.created_at,p.pseudonym,p.role FROM reviews r JOIN profiles p ON p.user_id=r.author_id WHERE r.teacher_id=$1 AND r.status='approved' AND NOT p.disabled ORDER BY r.created_at DESC",[id]);
  return {teacher:t,schools,reviews};
});
export const offers = () => serialized(()=>query('SELECT o.*,t.name,t.demo FROM offers o JOIN teachers t ON t.id=o.teacher_id WHERE o.active AND NOT t.withdrawn AND t.claimed_by IS NOT NULL ORDER BY o.price'));
export const alumniList = () => serialized(()=>query("SELECT a.public_name,a.graduation,a.university,a.field,a.bio,s.id AS school_id,s.name AS school_name,s.demo FROM alumni a JOIN schools s ON s.id=a.school_id JOIN profiles p ON p.user_id=a.user_id WHERE a.published AND p.age_band='adult' AND NOT p.disabled ORDER BY a.graduation DESC"));
export const dashboard = (id:string) => serialized(async()=> {
  await purgeDocuments(query);
  const p=(await query('SELECT p.*,u.phone_number FROM profiles p JOIN auth_user u ON u.id=p.user_id WHERE p.user_id=$1',[id]))[0];
  if(!p||p.disabled) return {profile:p};
  const families=await query('SELECT * FROM families WHERE parent_id=$1 OR child_id=$1 OR invited_phone=$2',[id,p.phone_number]);
  const checks=await query('SELECT c.*,t.name AS teacher_name,s.name AS school_name FROM checks c LEFT JOIN teachers t ON t.id=c.teacher_id LEFT JOIN schools s ON s.id=c.school_id WHERE c.user_id=$1 ORDER BY c.created_at DESC',[id]);
  const reviews=await query('SELECT r.id,r.teacher_id,r.body,r.clarity,r.respect,r.fairness,r.feedback,r.status,r.reason,r.context,r.academic_year,r.family_id,(r.author_id=$1) AS own,t.name FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.author_id=$1 OR r.family_id IN(SELECT id FROM families WHERE parent_id=$1) ORDER BY r.updated_at DESC',[id]);
  const requests=await query(`SELECT r.id,r.message,r.status,r.family_id,r.created_at,o.subject,t.name AS teacher_name,(t.claimed_by=$1) AS is_teacher,
    CASE WHEN r.status='accepted' AND (r.family_id IS NULL OR (f.status='approved' AND f.parent_consented)) THEN CASE WHEN t.claimed_by=$1 THEN coalesce(pu.phone_number,u.phone_number) ELSE tu.phone_number END ELSE NULL END AS contact
    FROM requests r JOIN offers o ON o.id=r.offer_id JOIN teachers t ON t.id=o.teacher_id JOIN auth_user u ON u.id=r.user_id LEFT JOIN auth_user tu ON tu.id=t.claimed_by LEFT JOIN families f ON f.id=r.family_id LEFT JOIN auth_user pu ON pu.id=f.parent_id
    WHERE (r.user_id=$1 OR f.parent_id=$1 OR (t.claimed_by=$1 AND r.status<>'guardian_pending')) ORDER BY r.created_at DESC`,[id]);
  const teacher=(await query('SELECT * FROM teachers WHERE claimed_by=$1 AND NOT withdrawn',[id]))[0];
  const alumni=(await query('SELECT * FROM alumni WHERE user_id=$1',[id]))[0];
  const privacy=await query('SELECT id,kind,status,reason FROM privacy_requests WHERE user_id=$1 ORDER BY created_at DESC',[id]);
  const ownOffers=teacher?await query('SELECT * FROM offers WHERE teacher_id=$1 ORDER BY subject,level',[teacher.id]):[];
  return {profile:p,families,checks,reviews,requests,teacher,alumni,privacy,ownOffers};
});
export const adminData = (id:string) => serialized(async()=> {
  const p=await new Service(query).staff(id); await purgeDocuments(query);
  const reviews=await query("SELECT r.*,t.name FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.status='pending' OR r.reply_pending IS NOT NULL ORDER BY r.created_at");
  // Staff UI never needs to show private review author IDs.
  for(const r of reviews) { delete r.author_id; delete r.subject_key; delete r.family_id; }
  const reports=await query("SELECT r.id,r.review_id,r.reason,v.body,t.name FROM reports r JOIN reviews v ON v.id=r.review_id JOIN teachers t ON t.id=v.teacher_id WHERE r.status='pending'");
  if(p.staff_role!=='admin') return {profile:p,reviews,reports};
  return {profile:p,reviews,reports,
    checks:await query("SELECT c.*,t.name AS teacher_name,u.name AS user_name FROM checks c JOIN auth_user u ON u.id=c.user_id LEFT JOIN teachers t ON t.id=c.teacher_id WHERE c.status='pending' ORDER BY c.created_at"),
    privacy:await query("SELECT * FROM privacy_requests WHERE status='pending' ORDER BY created_at"),
    sources:await query('SELECT * FROM sources ORDER BY fetched_at DESC'),
    imports:await query('SELECT id,kind,status,errors,source_id,jsonb_array_length(payload) AS row_count,payload->0 AS sample FROM import_batches ORDER BY created_at DESC LIMIT 20'),
    audit:await query('SELECT action,target_id,reason,created_at FROM audit ORDER BY created_at DESC LIMIT 30'),
  };
});
