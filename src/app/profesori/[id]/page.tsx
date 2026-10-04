import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { teacherDetail, dashboard } from '@/lib/read';
import { curatedTeachers } from '@/lib/curated-teachers';
import { PageHeading, Section, Badge, Source, Form, Field, Submit, Notice, Empty, formatNumber } from '@/components/ui';
export default async function Teacher({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, p = await searchParams, result = await teacherDetail(id);
  if (!result) notFound();
  const { teacher: t, schools, reviews } = result, user = await currentUser();
  const account = user ? await dashboard(user.id) : null;
  const families = account?.families?.filter(f => f.status === 'approved' && f.parent_consented) || [];
  const provenance = curatedTeachers.find(profile => profile.id === id);
  return <div className="container page-content"><div className="breadcrumbs"><Link href="/profesori">Profesori</Link><span>/</span><span>{t.name}</span></div><PageHeading eyebrow={t.subjects.join(' · ')} title={t.name} description={t.bio}/><Notice params={p}/><div className="tags">{t.demo && <Badge tone="amber">Persoană fictivă · demo</Badge>}<Badge tone={t.claimed ? 'green' : 'gray'}>{t.claimed ? 'Profil revendicat' : 'Profil nerevendicat'}</Badge></div>
    <Section title="Profil și proveniență"><p>Vechime: {t.experience_confirmed && t.start_year ? `din ${t.start_year} · informație confirmată în setul ${t.demo ? 'demo' : 'validat'}` : 'necunoscută / neconfirmată'}.</p><p>Actualizat: {new Date(t.updated_at).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}</p>{schools.map(s => <p key={s.id}><Link className="text-link" href={`/scoli/${s.id}`}>{s.name} · {s.city}</Link></p>)}<Source title={t.source_title} url={t.source_url}/><div className="tags"><Link className="button secondary" href={`/cont?teacher=${id}#verificari`}>Revendică sau verifică profilul</Link><Link className="text-link" href={`/solicitari?kind=profile&teacher=${id}`}>Solicită retragere sau corectare</Link></div></Section>
    {provenance && <Section id="provenienta" title="Informații profesionale și surse" description="Profil de prototip propus de un fost elev. Proveniența este indicată pentru fiecare informație. Statutul revendicării este afișat separat.">
      {provenance.facts.map((fact, index) => <article className="profile-fact" key={index}><Badge tone={fact.status === 'public' ? 'green' : 'amber'}>{fact.status === 'public' ? 'Menționat în sursa publică' : 'Furnizat de contributor · neconfirmat'}</Badge><p>{fact.text}</p>{'url' in fact && <Source title={fact.title} url={fact.url}/>}</article>)}
      <p className="small">Nu publicăm automat un scor sau recenzii. Experiențele se trimit din cont și urmează verificarea relației și moderarea.</p>
    </Section>}
    {(['class', 'tutoring'] as const).map(context => {
      const items = reviews.filter(r => r.context === context);
      return <Section key={context} title={context === 'class' ? 'Experiențe de la clasă' : 'Experiențe la meditații'} description={`${items.length} recenzii aprobate · scoruri agregate de la minimum 5 recenzii`}>
        {items.length >= 5 && <div className="review-scores">{[['clarity', 'Claritate'], ['respect', 'Respect'], ['fairness', 'Corectitudine'], ['feedback', 'Feedback']].map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatNumber(items.reduce((sum, r) => sum + r[key], 0) / items.length)} / 5</strong></div>)}</div>}
        {items.map(r => <article className="review" key={r.id}><div className="tags"><strong>{r.pseudonym}</strong><Badge tone="gray">{r.role === 'parent' ? 'Experiența părintelui' : 'Experiență personală'}</Badge><Badge>{t.demo ? 'Verificare demonstrativă' : 'Relație verificată pentru context și an'}</Badge></div><p className="preserve-lines">{r.body}</p>{r.reply && <blockquote><strong>Răspunsul profesorului</strong><p>{r.reply}</p></blockquote>}
          {user && <details><summary>Raportează recenzia</summary><Form op="report" returnTo={`/profesori/${id}`}><input type="hidden" name="id" value={r.id}/><Field label="Motivul raportării"><textarea name="reason" minLength={10} maxLength={1000} required/></Field><Submit>Trimite raportarea</Submit></Form></details>}
          {account?.teacher?.id === id && <details><summary>Răspunde recenziei</summary><Form op="reply" returnTo={`/profesori/${id}`}><input type="hidden" name="id" value={r.id}/><Field label="Răspuns (va fi moderat)"><textarea name="body" minLength={10} maxLength={1500} required/></Field><Submit>Trimite răspunsul</Submit></Form></details>}
        </article>)}{!items.length && <Empty title="Nu există recenzii aprobate în acest context."/>}
      </Section>;
    })}
    <Section title="Descrie experiența ta" description="Ai nevoie de relație verificată cu profesorul și, pentru clasă, de apartenență școlară verificată în același an.">
      {user && account?.profile && !account.profile.disabled ? <Form op="review" returnTo={`/profesori/${id}`}><input type="hidden" name="teacher_id" value={id}/><div className="field-grid"><Field label="Context"><select name="context"><option value="class">La clasă</option><option value="tutoring">La meditații</option></select></Field><Field label="An școlar"><input name="academic_year" defaultValue="2025–2026" pattern="20[0-9]{2}[–-]20[0-9]{2}" required/></Field></div>{families.length > 0 && <Field label="Experiență"><select name="family_id"><option value="">Experiența mea</option>{families.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>}<div className="field-grid">{[['clarity', 'Claritate'], ['respect', 'Respect'], ['fairness', 'Corectitudine'], ['feedback', 'Feedback']].map(([name, label]) => <Field key={name} label={label}><select name={name} defaultValue="5">{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></Field>)}</div><Field label="Experiența, în cuvintele tale"><textarea name="body" minLength={40} maxLength={2000} required/></Field><p className="small">O recenzie pentru același context și an înlocuiește contribuția ta anterioară și reia moderarea.</p><Submit>Trimite pentru moderare</Submit><Link className="text-link" href={`/cont?teacher=${id}#verificari`}>Gestionează verificările</Link></Form> : <Link className="button" href={user ? '/cont' : '/autentificare'}>{user ? 'Completează profilul' : 'Intră în cont'}</Link>}
    </Section>
  </div>;
}
