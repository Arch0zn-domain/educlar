import Link from 'next/link';
import { query, serialized } from '@/lib/db';
import { PageHeading, Section, Source, Badge } from '@/components/ui';
import { educationSources } from '@/lib/education-sources';
export const metadata = { title: 'Surse și metodologie' };
export default async function Methodology() {
  const { sources, coverage } = await serialized(async () => ({
    sources: await query("SELECT title,url,publisher,year,license,demo,fetched_at FROM sources WHERE status='approved' ORDER BY demo,fetched_at DESC,title"),
    coverage: (await query("SELECT value FROM app_meta WHERE key='official-coverage'"))[0]?.value,
  }));
  const summary = coverage ? JSON.parse(coverage) : null;
  return <div className="container page-content legal-page">
    <PageHeading title="Datele, în context." description="Proveniență vizibilă, definiții clare și limite explicate."/>
    <Section title="Sursele datelor educaționale">
      <p>Folosim date publicate de Ministerul Educației pe data.gov.ro și rapoarte oficiale ale examenelor. EduClar este un proiect independent; citarea acestor surse nu reprezintă o afiliere cu ministerul.</p>
      {educationSources.map(source => <div className="list-row" key={source.url}><div><Source title={source.title} url={source.url}/><p>{source.description}</p></div></div>)}
    </Section>
    <Section title="Ce date sunt integrate">
      <p>Catalogul include liceele, colegiile și școlile gimnaziale identificabile din rețeaua 2025–2026. Nu este un registru al tuturor tipurilor de unități: grădinițele și alte tipuri neacoperite de catalog sunt excluse. Legătura cu rezultatele BAC, EN și admitere 2026 se face prin codul SIIIR, fără potriviri aproximative după nume.</p>
      {summary && <><p><strong>{summary.included_schools.toLocaleString('ro-RO')} instituții</strong> din {summary.network_rows.toLocaleString('ro-RO')} rânduri ale rețelei; {summary.bac.school_cohorts.toLocaleString('ro-RO')} cohorte BAC, {summary.en.school_cohorts.toLocaleString('ro-RO')} cohorte EN și {summary.admission.included_specializations.toLocaleString('ro-RO')} specializări de admitere.</p><p className="small">Preluat la {new Date(summary.retrieved_at).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}. Neasociate catalogului: {summary.bac.unmatched_candidates} înregistrări BAC, {summary.en.unmatched_candidates} înregistrări EN și {summary.admission.unmatched_specializations} specializări. Acestea nu sunt incluse în indicatori. Detaliile a {summary.suppressed_cohorts} cohorte sunt suprimate.</p></>}
      <p>Fișierele complete sunt prelucrate într-un instantaneu local. Aplicația nu stochează coduri de candidați, note individuale, nume de elevi sau date personale din fișierele de examene. Numărul elevilor înscriși nu este dedus din candidați; unde lipsește rămâne „—”.</p>
    </Section>
    <Section title="Cum citim rezultatele">
      <p>Elevii înscriși în întreaga instituție sunt separați de candidații la examen. Absențele nu sunt note de zero. EN se atribuie școlii de proveniență, iar admiterea liceului de destinație. Comparăm același examen, an și sesiune.</p>
      <p>Pentru EN, media include doar mediile numerice ale candidaților prezenți la toate probele obligatorii. Pentru BAC, folosim media finală publicată; la nepromovații fără medie publicată calculăm media probelor scrise numai dacă toate notele finale necesare sunt disponibile, cu notele de după contestație având prioritate. Această medie derivată este trunchiată la două zecimale. Absenții și eliminații nu intră în media rezultatelor valide. Promovarea BAC folosește statusul oficial „Promovat”, împărțit la numărul candidaților care nu au statusul „Absent”, inclusiv eliminații.</p>
      <p>Admiterea prezintă locurile ocupate și ultima medie din repartizarea computerizată din iulie 2026, pe cod de specializare, limbă și formă de învățământ. Media anului anterior nu este substituită celei curente.</p>
      <p>Grupurile cu mai puțin de 10 candidați și distribuțiile cu categorii de 1–4 persoane au indicatorii detaliați suprimați înainte de salvarea instantaneului și la afișare. Rezultatele unei instituții nu măsoară performanța individuală a profesorilor.</p>
    </Section>
    <Section title="Ce înseamnă demonstrația"><p>Instituțiile, persoanele, recenziile și statisticile marcate demo sunt sintetice și rămân distincte de datele oficiale. Verificările demo nu reprezintă dovezi reale. Nu importăm din aceste surse identitatea sau performanța individuală a profesorilor.</p></Section>
    <Section title="Recenzii și profiluri"><p>Experiențele de la clasă și meditații sunt separate. Scorurile sunt afișate de la minimum cinci recenzii aprobate în același context. Telefonul nu confirmă identitatea. Apartenența școlară, relația cu profesorul și tutela necesită verificări distincte. Profesorii revendică profilul prin dovezi profesionale; vechimea necunoscută este marcată ca atare.</p></Section>
    <Section title="Registrul surselor">{sources.map((s, i) => <div key={i} className="list-row"><div><Source title={s.title} url={s.url}/><p>{s.publisher} · {s.year}</p><p className="small">{s.license} · preluat la {new Date(s.fetched_at).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}</p></div>{s.demo && <Badge tone="amber">Demo</Badge>}</div>)}</Section>
    <Link className="text-link" href="/solicitari">Semnalează o eroare sau solicită o corectare</Link>
  </div>;
}
