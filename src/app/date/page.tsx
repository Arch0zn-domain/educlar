import Link from 'next/link';
import { officialOverview } from '@/lib/read';
import { PageHeading, Section, formatNumber, Badge } from '@/components/ui';

export const metadata = { title: 'Date oficiale și acoperire' };

export default async function DataCoverage() {
  const { schools, periods, coverage } = await officialOverview();
  const cohorts = periods.reduce((sum, row) => sum + row.cohorts, 0);
  const suppressed = periods.reduce((sum, row) => sum + row.suppressed, 0);
  const years = [...new Set(periods.map(row => row.year))];
  return <div className="container page-content">
    <PageHeading eyebrow="SURSE VERIFICABILE" title="Date din toată țara." description="Instituții și rezultate agregate, cu anul, examenul și proveniența la vedere."/>
    <div className="metric-grid">
      <div className="metric"><span>Instituții oficiale</span><strong>{formatNumber(schools.schools)}</strong><small>Rețeaua școlară 2025–2026</small></div>
      <div className="metric"><span>Județe și București</span><strong>{formatNumber(schools.counties)}</strong><small>Asociere prin codul SIIIR</small></div>
      <div className="metric"><span>Cohorte și specializări</span><strong>{formatNumber(cohorts)}</strong><small>{years.join(' · ')}</small></div>
    </div>
    <Section title="Explorează pe an și examen" description="O cohortă reprezintă o instituție la un examen și o sesiune; admiterea este împărțită pe specializări.">
      <div className="table-wrap"><table><thead><tr><th>An</th><th>Examen</th><th>Cohorte / specializări</th><th>Candidați / locuri ocupate</th><th>Cu indicatori vizibili</th><th>Explorează</th></tr></thead><tbody>
        {periods.map(row=><tr key={`${row.year}-${row.exam}`}><td>{row.year}</td><td><Badge>{row.exam}</Badge></td><td>{formatNumber(row.cohorts)}</td><td>{formatNumber(row.candidates)}</td><td>{formatNumber(row.cohorts-row.suppressed)}</td><td><Link className="text-link" href={`/scoli?data=official&exam=${row.exam}&year=${row.year}`}>Vezi instituțiile</Link></td></tr>)}
      </tbody></table></div>
      <p className="small">Numerele candidaților sunt însumate pentru fiecare an și examen. Același elev poate participa în mai mulți ani sau la examene diferite; aceste valori nu reprezintă persoane unice.</p>
    </Section>
    <Section title="Acoperire și limite">
      <p>{formatNumber(cohorts-suppressed)} cohorte și specializări au indicatori detaliați vizibili. Pentru {formatNumber(suppressed)} grupuri, aceștia sunt suprimați conform regulilor de protejare a grupurilor mici.</p>
      <p>Fișierele BAC și EN acoperă sesiunea de vară. Rețeaua 2025–2026 oferă denumirile și localitățile curente; instituțiile istorice fără același cod SIIIR în această rețea nu sunt atribuite aproximativ altor școli.</p>
      {coverage?.by_year && Object.entries(coverage.by_year).map(([year, value])=>{
        const data = value as { bac?:{unmatched_candidates:number};en?:{unmatched_candidates:number};admission?:{available?:boolean;reason?:string;unmatched_specializations?:number} };
        return <div className="list-row" key={year}><div><h3>{year}</h3><p>Neasociate catalogului: BAC {formatNumber(data.bac?.unmatched_candidates)} înregistrări, EN {formatNumber(data.en?.unmatched_candidates)} înregistrări{data.admission?.available===false?'.':`, admitere ${formatNumber(data.admission?.unmatched_specializations)} specializări.`}</p>{data.admission?.available===false&&<p>{data.admission.reason}</p>}</div></div>;
      })}
      {coverage?.retrieved_at&&<p className="small">Ultima preluare: {new Date(coverage.retrieved_at).toLocaleDateString('ro-RO',{timeZone:'Europe/Bucharest'})}. Fișierele și hashurile surselor sunt păstrate în instantaneul proiectului.</p>}
      <Link className="text-link" href="/metodologie">Surse, licențe și metodologia completă →</Link>
    </Section>
  </div>;
}
