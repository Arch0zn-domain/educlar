import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { query,serialized } from '@/lib/db';
import { Service } from '@/lib/service';
import { Form,Field,PageHeading,Section,Notice,Badge } from '@/components/ui';
import { label } from '@/lib/labels';
export const metadata={title:'Solicitări de confidențialitate'};
export default async function PrivacyAdmin({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user=await currentUser();if(!user)redirect('/autentificare');
  const allowed=await serialized(async()=>{try{await new Service(query).staff(user.id,true);return true;}catch{return false;}});
  if(!allowed)return <div className="container page-content"><PageHeading title="Acces restricționat."/></div>;
  const [requests,users,content,runs,failures]=await serialized(()=>Promise.all([
    query('SELECT id,kind,user_id,teacher_id,contact,message,status,reason,outcome,subject_id,export_expires_at FROM privacy_requests ORDER BY created_at DESC LIMIT 100'),
    query('SELECT u.id,u.name,p.pseudonym FROM auth_user u JOIN profiles p ON p.user_id=u.id WHERE NOT p.disabled ORDER BY u.name'),
    query(`SELECT 'review:'||r.id AS value,t.name||' · recenzie · '||left(r.body,70) AS title FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.status='approved'
      UNION ALL SELECT 'reply:'||r.id,t.name||' · răspuns · '||left(r.reply,70) FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.reply IS NOT NULL
      UNION ALL SELECT 'offer:'||o.id,t.name||' · ofertă · '||o.subject FROM offers o JOIN teachers t ON t.id=o.teacher_id WHERE o.active
      UNION ALL SELECT 'alumni:'||user_id,'Absolvent · '||public_name FROM alumni WHERE published`),
    query('SELECT * FROM maintenance_runs ORDER BY started_at DESC LIMIT 20'),
    query('SELECT id,deletion_attempts,deletion_error,retry_at FROM documents WHERE deleted_at IS NULL AND deletion_error IS NOT NULL'),
  ]));
  return <div className="container page-content"><PageHeading title="Solicitări și retenție" description="Cererea devine finalizată numai după operația corespunzătoare. Ștergerea fișierelor poate necesita reîncercări."/><Notice params={await searchParams}/><Link className="text-link" href="/admin/replies">Moderarea răspunsurilor</Link>
    <Section title="Solicitări">{requests.map(r=><article className="queue-item" key={r.id}><h3>{label(r.kind)}</h3><Badge tone="gray">{label(r.status)}</Badge><p>{r.message}</p><p>Contact: {r.contact}</p>{r.reason&&<p>Rezultat: {r.reason}</p>}{r.outcome?.action&&<p className="small">Operație înregistrată: {r.outcome.action}</p>}
      {r.status==='completed'&&r.kind==='access'&&r.export_expires_at&&new Date(r.export_expires_at)>new Date()&&<Link className="button secondary" href={`/api/privacy/${r.id}/export`}>Descarcă exportul privat pentru predare verificată</Link>}
      {r.status==='pending'&&<Form op="privacyDecide" returnTo="/admin/privacy"><input type="hidden" name="id" value={r.id}/>
        {!r.user_id&&['access','correction','account'].includes(r.kind)&&<Field label="Contul titularului verificat"><select name="subject_id" required><option value="">Alege contul după verificarea identității</option>{users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.pseudonym}</option>)}</select></Field>}
        {r.kind==='correction'&&<><Field label="Date de corectat"><select name="correction_spec" required><option value="">Alege câmpul verificat</option><option value="account:name">Numele din cont</option><option value="alumni:public_name">Numele public al absolventului</option><option value="alumni:university">Facultate / traseu</option><option value="alumni:field">Domeniu profesional</option><option value="alumni:bio">Prezentarea absolventului</option><option value="alumni:graduation">Promoția</option><option value="teacher:name">Numele profesorului din profilul vizat</option><option value="teacher:bio">Prezentarea profesorului</option><option value="teacher:start_year">Anul începerii activității</option></select></Field><Field label="Valoarea verificată"><textarea name="correction_value" maxLength={2000} required/></Field></>}
        {r.kind==='illegal'&&<Field label="Conținutul vizat de retragere"><select name="content_target" required><option value="">Selectează exact conținutul analizat</option>{content.map(c=><option key={c.value} value={c.value}>{c.title}</option>)}</select></Field>}
        <Field label="Răspuns și motiv"><textarea name="reason" minLength={10} maxLength={2000} required/></Field><label className="check-field"><input name="identity_confirmed" type="checkbox" value="yes" required/>Am verificat titularul sau temeiul sesizării și operația vizată.</label>
        <div className="decisions"><button className="button" name="decision" value="approve">{r.kind==='access'?'Generează exportul':r.kind==='correction'?'Aplică rectificarea':r.kind==='illegal'?'Retrage conținutul':r.kind==='account'?'Execută ștergerea contului':'Retrage profilul'}</button><button className="button secondary" name="decision" value="reject" formNoValidate>Respinge cu motiv</button></div>
      </Form>}{r.status==='processing'&&<p>Contul este dezactivat. Fișierele rămase sunt inaccesibile și vor fi reîncercate de jobul de retenție.</p>}
    </article>)}</Section>
    <Section title="Jobul de retenție"><p>Rulează la pornirea serverului și apoi la fiecare oră, fără a depinde de vizite.</p>{runs.map(r=><div className="list-row" key={r.id}><div><strong>{r.status}</strong><p>{new Date(r.started_at).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'})} · {r.deleted_documents} șterse · {r.failed_documents} eșuate{r.error?` · ${r.error}`:''}</p></div></div>)}{failures.map(d=><div className="notice error" key={d.id}>Dovadă {d.id}: {d.deletion_error} · {d.deletion_attempts} încercări · reîncercare după {d.retry_at?new Date(d.retry_at).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}):'următorul ciclu'}.</div>)}</Section>
  </div>;
}
