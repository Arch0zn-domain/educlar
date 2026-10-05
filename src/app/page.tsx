import Link from 'next/link';
import { ArrowRight, Search, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { catalog, totals, teachers } from '@/lib/read';
import { SchoolCard, TeacherCard, StepLink } from '@/components/ui';

export default async function Home() {
  const [{ schools }, counts, staff] = await Promise.all([catalog(), totals(), teachers()]);

  return <>
    <section className="hero">
      <div className="container hero-main">
        <div className="hero-copy">
          <div className="eyebrow hero-kicker"><span className="status-dot"/>ALEGERI INFORMATE. VIITOR DESCHIS.</div>
          <h1>Următorul pas în educație,<br/><em>mai clar.</em></h1>
          <p>Școli, profesori și experiențe reale, într-un singur loc.<br className="desktop-break"/> Găsește direcția potrivită pentru tine.</p>
          <form action="/scoli" className="hero-search" role="search">
            <Search size={20} aria-hidden="true"/>
            <input name="q" placeholder="Caută o școală sau un oraș…" aria-label="Caută o școală sau un oraș"/>
            <button className="button" type="submit">Explorează<ArrowRight size={16} aria-hidden="true"/></button>
          </form>
          <div className="hero-suggestions"><span>Începe cu</span>{['București', 'Cluj-Napoca', 'Iași'].map(city => <Link key={city} href={`/scoli?q=${encodeURIComponent(city)}`}>{city}<ArrowUpRight size={11} aria-hidden="true"/></Link>)}</div>
          <div className="hero-trust"><ShieldCheck size={15} aria-hidden="true"/><span>Acces liber. Surse transparente.</span><Link href="/metodologie">Cum funcționează<ArrowUpRight size={12} aria-hidden="true"/></Link></div>
        </div>
      </div>
      <nav className="container home-paths" aria-label="De unde vrei să începi?">
        <StepLink number="01" title="Descoperă școala" description="Rezultate, specializări și comparații utile." href="/scoli"/>
        <StepLink number="02" title="Cunoaște profesorii" description="Profiluri și experiențe ale comunității." href="/profesori"/>
        <StepLink number="03" title="Găsește meditații" description="Sprijin pentru următorul tău pas." href="/meditatii"/>
      </nav>
    </section>

    <section className="featured-section">
      <div className="container">
        <div className="section-heading">
          <div><div className="eyebrow">ȘCOLI ȘI LICEE</div><h2>O alegere începe cu informarea.</h2><p>{counts.official ? `${counts.official.toLocaleString('ro-RO')} instituții din surse oficiale. Descoperă ce ți se potrivește.` : 'Explorează catalogul demonstrativ. Importurile oficiale se validează separat.'}</p></div>
          <Link className="text-link" href="/scoli">Toate școlile<ArrowRight size={16}/></Link>
        </div>
        <div className="school-grid">{schools.slice(0, 3).map(school => <SchoolCard key={school.id} school={school}/>)}</div>
        <div className="subtle-note"><ShieldCheck size={14}/>Instituțiile, persoanele și statisticile marcate „demo” sunt exemple fictive.</div>
      </div>
    </section>

    <section className="container home-section home-teachers">
      <div className="section-heading">
        <div><div className="eyebrow">OAMENII DIN EDUCAȚIE</div><h2>Un profesor poate schimba perspectiva.</h2><p>Cunoaște oamenii din spatele materiilor și experiențele comunității.</p></div>
        <Link className="text-link" href="/profesori">Toți profesorii<ArrowRight size={16}/></Link>
      </div>
      <div className="teacher-grid">{staff.slice(0, 3).map(teacher => <TeacherCard key={teacher.id} teacher={teacher}/>)}</div>
    </section>

    <section className="container">
      <div className="community-banner">
        <div><div className="eyebrow">UN VIITOR, MULTE DRUMURI</div><h2>Fiecare drum are o poveste.</h2><p>Descoperă traseele absolvenților. Sau împărtășește-l pe al tău.</p></div>
        <Link className="button secondary" href="/absolventi">Descoperă absolvenții<ArrowUpRight size={16}/></Link>
      </div>
    </section>
  </>;
}
