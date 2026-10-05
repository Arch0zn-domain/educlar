'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export function SchoolFilters({ params, places, years }: { params: Record<string, string | undefined>; places: { county: string; city: string }[]; years: number[] }) {
  const [county, setCounty] = useState(params.county || '');
  const [city, setCity] = useState(params.city || '');
  const counties = [...new Set(places.map(place => place.county))];
  const cities = [...new Set(places.filter(place => !county || place.county === county).map(place => place.city))];

  return <form action="/scoli" className="filters school-filters">
    <div className="filter-main">
      <label className="search-field">Școală sau localitate<input aria-label="Școală sau localitate" name="q" defaultValue={params.q} placeholder="Caută un nume sau un oraș…"/></label>
      <label>Județ<select aria-label="Județ" name="county" value={county} onChange={event => { setCounty(event.target.value); setCity(''); }}><option value="">Toate județele</option>{counties.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Localitate<select aria-label="Localitate" name="city" value={city} onChange={event => setCity(event.target.value)}><option value="">Toate localitățile</option>{cities.map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="button">Caută</button>
      <Link className="text-link" href="/scoli">Resetează</Link>
    </div>
    <details className="filter-advanced" open={Boolean(params.type || params.data || params.year || params.exam)}>
      <summary><SlidersHorizontal size={14} aria-hidden="true"/>Mai multe filtre<ChevronDown size={14} aria-hidden="true"/></summary>
      <div className="filter-fields">
        <label>Tip<select aria-label="Tip" name="type" defaultValue={params.type || ''}><option value="">Toate tipurile</option><option value="colegiu">Colegiu</option><option value="liceu">Liceu</option><option value="gimnaziu">Gimnaziu</option></select></label>
        <label>Date<select aria-label="Date" name="data" defaultValue={params.data || ''}><option value="">Toate seturile</option><option value="official">Doar oficiale</option><option value="demo">Doar demonstrative</option></select></label>
        <label>An rezultate<select aria-label="An rezultate" name="year" defaultValue={params.year || ''}><option value="">Cel mai recent disponibil</option>{years.map(year => <option key={year}>{year}</option>)}</select></label>
        <label>Examen<select aria-label="Examen" name="exam" defaultValue={params.exam || ''}><option value="">Potrivit tipului de școală</option><option>BAC</option><option>EN</option><option value="ADMITERE">Admitere</option></select></label>
      </div>
    </details>
  </form>;
}
