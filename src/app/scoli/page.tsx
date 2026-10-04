import Link from 'next/link';
import { catalog,locations,catalogPeriods } from '@/lib/read';
import { PageHeading,SchoolCard,Empty } from '@/components/ui';
import { SchoolFilters } from '@/components/school-filters';
export const metadata={title:'Școli și licee'};
export default async function Schools({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams;const [{schools,count,page},places,periods]=await Promise.all([catalog(p),locations(),catalogPeriods()]);
  const pageUrl=(n:number)=>'/scoli?'+new URLSearchParams({...Object.fromEntries(Object.entries(p).filter(([,v])=>v!==undefined) as [string,string][]),page:String(n)});
  return <div className="container page-content"><PageHeading eyebrow="CATALOGUL EDUCLAR" title="O școală. Un nou început." description="Explorează instituțiile, înțelege rezultatele și compară ce contează pentru tine."/><SchoolFilters params={p} places={places.map(x=>({county:x.county,city:x.city}))} years={[...new Set(periods.map(x=>x.year))]}/><div className="results-label"><span>{count.toLocaleString('ro-RO')} instituții găsite{p.year || p.exam ? ' · cu rezultate pentru selecția aleasă' : ''}</span><Link href="/date" className="text-link">Vezi acoperirea datelor</Link></div><div className="school-grid">{schools.map((s,i)=><SchoolCard key={s.id} school={s} index={i}/>)}{!schools.length&&<Empty title="Nu am găsit instituții pentru aceste filtre.">Încearcă altă localitate, alt an sau alt set de date.</Empty>}</div>{count>24&&<div className="pagination">{page>1&&<Link className="button secondary" href={pageUrl(page-1)}>Înapoi</Link>}<span>Pagina {page} din {Math.ceil(count/24)}</span>{page*24<count&&<Link className="button secondary" href={pageUrl(page+1)}>Următoarea</Link>}</div>}</div>;
}
