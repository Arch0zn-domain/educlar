'use client';
import { useState } from 'react';
import { normalize } from '@/lib/search';
export function SchoolSelect({schools,name='school_id',defaultValue='',required=true}:{schools:{id:string;name:string;city?:string}[];name?:string;defaultValue?:string;required?:boolean}) {
  const [search,setSearch]=useState(''),[selected,setSelected]=useState(defaultValue);
  const options=schools.filter(s=>normalize(`${s.name} ${s.city||''}`).includes(normalize(search))).slice(0,50);
  const current=schools.find(s=>s.id===selected); if(current&&!options.some(s=>s.id===current.id))options.unshift(current);
  return <div className="school-select"><input aria-label="Caută instituția în listă" placeholder="Caută după nume sau localitate…" value={search} onChange={e=>setSearch(e.target.value)}/><select name={name} value={selected} onChange={e=>setSelected(e.target.value)} required={required} aria-label="Instituție"><option value="">Alege instituția</option>{options.map(s=><option key={s.id} value={s.id}>{s.name}{s.city?` · ${s.city}`:''}</option>)}</select></div>;
}
