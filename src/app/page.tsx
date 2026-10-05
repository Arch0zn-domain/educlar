import Link from 'next/link';
import { ArrowRight, Search, ShieldCheck, ArrowUpRight, Quote } from 'lucide-react';
import { catalog, featuredReviews, totals, teachers } from '@/lib/read';
import { SchoolCard, TeacherCard, StepLink } from '@/components/ui';

export default async function Home() {
  const [{ schools }, counts, staff, reviews] = await Promise.all([catalog(), totals(), teachers(), featuredReviews()]);

  return <>
    <section className="hero">
      <div className="container hero-main">
        <div className="hero-copy">
          <div className="eyebrow hero-kicker"><span className="status-dot"/>ALEGERI INFORMATE. VIITOR DESCHIS.</div>
          <h1>Următorul pas în educație.<br/><em>Mai simplu. Mai sigur. Mai clar.</em></h1>
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

    <section className="home-testimonials" id="feedback" aria-labelledby="feedback-title">
      <div className="container">
        <div className="section-heading">
          <div><div className="eyebrow">FEEDBACK DIN COMUNITATE</div><h2 id="feedback-title">Experiențe care îi ajută pe ceilalți să aleagă.</h2><p>Recenzii publicate după verificare și moderare, cu identitatea autorilor protejată prin pseudonim.</p></div>
          <Link className="text-link" href="/profesori">Vezi profesorii<ArrowRight size={16}/></Link>
        </div>
        {reviews.length ? <div className="testimonial-grid">{reviews.map(review => <article className="testimonial-card" key={review.id}>
          <Quote className="testimonial-mark" size={22} aria-hidden="true"/>
          <blockquote><p>{review.body}</p></blockquote>
          <div className="testimonial-meta"><div><strong>{review.pseudonym}</strong><span>{review.context === 'class' ? 'Experiență la clasă' : 'Experiență la meditații'}</span></div><span className={`testimonial-badge${review.demo ? ' demo' : ''}`}>{review.demo ? 'Exemplu demo' : 'Relație verificată'}</span></div>
          <Link className="testimonial-teacher" href={`/profesori/${review.teacher_id}`}>Experiență cu {review.teacher_name}<ArrowUpRight size={14}/></Link>
        </article>)}</div> : <div className="testimonial-empty"><p>Primele experiențe publicate vor apărea aici după verificare și moderare.</p></div>}
        <div className="testimonial-invite"><div><strong>Ai o experiență de împărtășit?</strong><p>Alege profesorul și trimite recenzia ta pentru verificare.</p></div><Link className="button" href="/profesori">Trimite feedback<ArrowRight size={16}/></Link></div>
      </div>
    </section>

    <section className="container">
      <div className="community-banner">
        <div><div className="eyebrow">UN VIITOR, MULTE DRUMURI</div><h2>Fiecare drum are o poveste.</h2><p>Descoperă traseele absolvenților. Sau împărtășește-l pe al tău.</p></div>
        <Link className="button secondary" href="/absolventi">Descoperă absolvenții<ArrowUpRight size={16}/></Link>
      </div>
    </section>
  </>;
}
