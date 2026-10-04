import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { offers, dashboard } from '@/lib/read';
import { normalize } from '@/lib/search';
import { PageHeading, Section, Form, Field, Submit, Badge, Empty, Notice } from '@/components/ui';
export const metadata = { title: 'Meditații' };
export default async function Tutoring({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams, user = await currentUser();
  const all = await offers();
  const list = all.filter(o => (!p.q || normalize(`${o.name} ${o.subject} ${o.city}`).includes(normalize(p.q))) && (!p.format || o.format === p.format));
  const account = user ? await dashboard(user.id) : null;
  const families = account?.families?.filter(f => f.status === 'approved' && f.parent_consented) || [];
  return <div className="container page-content"><PageHeading eyebrow="ÎNVĂȚARE CU PERSPECTIVĂ" title="Găsește sprijinul potrivit." description="Trimite o cerere unui profesor cu profil revendicat. Datele de contact se dezvăluie participanților numai după acceptare."/><Notice params={p}/>
    <form className="filters" action="/meditatii"><label className="search-field">Materie, profesor sau oraș<input name="q" defaultValue={p.q}/></label><label>Format<select name="format" defaultValue={p.format || ''}><option value="">Toate formatele</option><option value="online">Online</option><option value="fizic">Fizic</option><option value="mixt">Mixt</option></select></label><button className="button">Caută</button><Link href="/meditatii" className="text-link">Resetează</Link></form>
    <div className="notice">EduClar facilitează cereri. Profesorul și solicitantul stabilesc direct condițiile ședințelor; platforma nu încasează plăți și nu garantează rezultate școlare.</div>
    {list.map(o => <Section key={o.id} title={`${o.subject} · ${o.level}`} description={`${o.format} · ${o.city} · ${o.duration} minute · ${o.price} lei`}><Link className="text-link" href={`/profesori/${o.teacher_id}`}>{o.name}</Link>{o.demo && <Badge tone="amber">Ofertă demo</Badge>}
      {user && account?.profile && !account.profile.disabled ? <details><summary>Trimite o cerere</summary><Form op="request" returnTo="/meditatii"><input type="hidden" name="offer_id" value={o.id}/>{families.length > 0 && <Field label="Participare"><select name="family_id"><option value="">Pentru mine</option>{families.map(f => <option value={f.id} key={f.id}>Pentru {f.label}</option>)}</select></Field>}<Field label="Ce ai vrea să înveți?"><textarea name="message" minLength={20} maxLength={1500} required/></Field><label className="check-field"><input type="checkbox" name="not_current_teacher" value="yes" required/>Confirm că nu solicit meditații contra cost profesorului care îmi predă în prezent la clasă.</label><Submit>Trimite cererea</Submit></Form></details> : <Link className="button secondary" href={user ? '/cont' : '/autentificare'}>{user ? 'Completează profilul' : 'Intră în cont pentru a trimite o cerere'}</Link>}
    </Section>)}{!list.length && <Empty title="Nu există oferte pentru aceste filtre."/>}
  </div>;
}
