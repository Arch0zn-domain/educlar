import Link from 'next/link';
import { teachers, schoolOptions } from '@/lib/read';
import { PageHeading, TeacherCard, Empty } from '@/components/ui';
export const metadata = { title: 'Profesori' };
export default async function Teachers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const [list, all, schools] = await Promise.all([teachers(p), teachers(), schoolOptions()]);
  const subjects = [...new Set(all.flatMap(t => t.subjects as string[]))].sort();
  return <div className="container page-content"><PageHeading eyebrow="OAMENII DIN EDUCAȚIE" title="Cunoaște profesorii." description="Profiluri cu proveniență vizibilă și experiențe ale comunității, moderate înainte de publicare."/>
    <form action="/profesori" className="filters"><label className="search-field">Profesor sau materie<input name="q" defaultValue={p.q} placeholder="Caută un nume sau o materie…"/></label><label>Materie<select name="subject" defaultValue={p.subject || ''}><option value="">Toate materiile</option>{subjects.map(s => <option key={s}>{s}</option>)}</select></label><label>Instituție<select name="school" defaultValue={p.school || ''}><option value="">Toate instituțiile</option>{schools.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label><button className="button">Caută</button><Link className="text-link" href="/profesori">Resetează</Link></form>
    <p className="results-label">{list.length} profesori găsiți</p><div className="teacher-grid">{list.map(t => <TeacherCard key={t.id} teacher={t}/>)}{!list.length && <Empty title="Nu am găsit profesori pentru aceste filtre."/>}</div>
  </div>;
}
