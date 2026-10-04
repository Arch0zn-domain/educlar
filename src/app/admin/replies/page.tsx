import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { query,serialized } from '@/lib/db';
import { Service } from '@/lib/service';
import { Form,Field,PageHeading,Notice } from '@/components/ui';
export default async function Replies({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user=await currentUser();if(!user)redirect('/autentificare');
  const allowed=await serialized(async()=>{try{await new Service(query).staff(user.id);return true;}catch{return false;}});
  if(!allowed)return <div className="container page-content"><PageHeading title="Acces restricționat."/></div>;
  const rows=await serialized(()=>query("SELECT r.id,r.body,r.version,r.reply_pending,r.reply_pending_id,t.name FROM reviews r JOIN teachers t ON t.id=r.teacher_id WHERE r.status='approved' AND r.reply_pending IS NOT NULL AND r.reply_pending_version=r.version"));
  return <div className="container page-content"><PageHeading title="Răspunsuri pentru moderare" description="Decizia este valabilă numai pentru recenzia și răspunsul afișate. Dacă se modifică între timp, trebuie reîncărcate."/><Notice params={await searchParams}/>{rows.map(r=><article className="queue-item" key={r.id}><h3>{r.name}</h3><p>{r.body}</p><blockquote>{r.reply_pending}</blockquote><Form op="replyDecide" returnTo="/admin/replies"><input type="hidden" name="id" value={r.id}/><input type="hidden" name="review_version" value={r.version}/><input type="hidden" name="reply_token" value={r.reply_pending_id}/><Field label="Motivul deciziei"><textarea name="reason" minLength={5} maxLength={1000} required/></Field><div className="decisions"><button className="button" name="decision" value="approve">Aprobă răspunsul afișat</button><button className="button secondary" name="decision" value="reject">Respinge</button></div></Form></article>)}</div>;
}
