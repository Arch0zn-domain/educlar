import Link from 'next/link';
import { ArrowUpRight, MapPin, School, ShieldCheck, BookOpen, ArrowRight } from 'lucide-react';
import { cloneElement, isValidElement, type ReactNode } from 'react';
import type { Row } from '@/lib/db';
import { act } from '@/app/actions';
import { CompareToggle } from './compare';
import { SubmitButton } from './submit';

export const formatNumber=(n:unknown)=>n===null||n===undefined?'—':Number(n).toLocaleString('ro-RO',{maximumFractionDigits:2,minimumFractionDigits:Number(n)%1?2:0});
export function Badge({children,tone='green'}:{children:ReactNode;tone?:string}) {return <span className={`badge ${tone}`}>{children}</span>;}
export function PageHeading({eyebrow,title,description,children}:{eyebrow?:string;title:string;description?:string;children?:ReactNode}) {return <div className="page-heading"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;}
export function Empty({title='Încă nu sunt informații aici.',children}:{title?:string;children?:ReactNode}) {return <div className="empty"><BookOpen size={28}/><h3>{title}</h3><p>{children||'Revino după următoarea actualizare sau încearcă alte filtre.'}</p></div>;}
export function Notice({params}:{params:Record<string,string|undefined>}) {return <>{params.error&&<div role="alert" className="notice error">{params.error}</div>}{params.success&&<div role="status" className="notice success">{params.success}</div>}</>;}
export function Form({op,returnTo='/cont',children,className='',...props}:{op:string;returnTo?:string;children:ReactNode;className?:string;id?:string}) {return <form action={act} className={`form ${className}`} {...props}><input type="hidden" name="op" value={op}/><input type="hidden" name="returnTo" value={returnTo}/>{children}</form>;}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {
  const control=isValidElement<Record<string,unknown>>(children)&&typeof children.type==='string'&&['input','select','textarea'].includes(children.type)?cloneElement(children,{'aria-label':children.props['aria-label']||label,'aria-description':hint}):children;
  return <div className="field"><span>{label}</span>{control}{hint&&<small>{hint}</small>}</div>;
}
export function Submit({children='Înregistrează',secondary=false}:{children?:ReactNode;secondary?:boolean}) {return <SubmitButton secondary={secondary}>{children}</SubmitButton>;}
export function Section({title,description,children,id}:{title:string;description?:string;children:ReactNode;id?:string}) {return <section className="panel" id={id}><div className="section-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div></div>{children}</section>;}
export function SchoolCard({school:s}:{school:Row}) {
  const admission = s.stat_exam === 'ADMITERE';
  const hasEnrollment = s.enrolled !== null && s.enrolled !== undefined;
  const result = admission ? (s.minimum_low === null ? '—' : s.minimum_low === s.minimum_high ? formatNumber(s.minimum_low) : `${formatNumber(s.minimum_low)}–${formatNumber(s.minimum_high)}`) : formatNumber(s.average);
  return <article className="school-card"><div className="school-card-heading"><span className="school-symbol"><School size={21} strokeWidth={1.5} aria-hidden="true"/></span><span className="school-kind">{s.type==='colegiu'?'Colegiu':s.type==='liceu'?'Liceu':'Gimnaziu'}</span></div><div className="school-card-content"><div className="meta"><MapPin size={13}/>{s.city}, {s.county}</div><Link href={`/scoli/${s.id}${s.stat_year ? `?year=${s.stat_year}` : ''}`} className="card-title">{s.name}<ArrowUpRight size={18}/></Link><div className="school-metrics"><div><span>{admission ? 'Ultime medii pe specializări' : `Medie ${s.stat_exam || (s.type==='gimnaziu'?'EN':'BAC')}`}{s.stat_year ? ` · ${s.stat_year}` : ''}</span><strong>{result}</strong></div><div><span>{admission ? 'Locuri ocupate' : hasEnrollment ? 'Elevi înscriși' : `Candidați ${s.stat_exam || 'la examen'}`}</span><strong>{formatNumber(admission || !hasEnrollment ? s.stat_candidates : s.enrolled)}</strong></div></div><div className="small school-sources">{s.average_suppressed && <p>Indicatori detaliați suprimați.</p>}{admission && <p>{s.specialization_count} specializări · intervalul mediilor nesuprimate</p>}{s.stat_source_url && <Source title={`${s.stat_source_title} · ${s.stat_session}`} url={s.stat_source_url}/>}<Source title={s.source_title} url={s.source_url}/></div><div className="card-bottom">{s.demo?<Badge tone="amber">Date demo</Badge>:<Badge>Date oficiale</Badge>}<CompareToggle school={{id:s.id,name:s.name}}/></div></div></article>;
}
export function TeacherCard({teacher:t}:{teacher:Row}) {return <article className="teacher-card"><div className="avatar">{t.name.split(' ').map((x:string)=>x[0]).slice(0,2).join('')}</div><div><div className="meta">{t.subjects.join(' · ')}</div><Link className="card-title" href={`/profesori/${t.id}`}>{t.name}<ArrowUpRight size={17}/></Link><p className="small">{t.schools?.[0]?.name||'Instituție în curs de confirmare'}</p><div className="tags">{t.claimed&&<Badge><ShieldCheck size={12}/>Revendicat</Badge>}{t.demo&&<Badge tone="amber">Demo</Badge>}</div></div></article>;}
export function Source({title,url}:{title:string;url:string}) {return <a className="source" href={url} target={url.startsWith('https')?'_blank':undefined} rel="noreferrer">Sursa: {title}<ArrowUpRight size={12}/></a>;}
export function StepLink({href,number,title,description}:{href:string;number:string;title:string;description:string}) {return <Link className="step-link" href={href}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowRight size={18}/></Link>;}
