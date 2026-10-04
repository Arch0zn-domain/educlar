'use client';
import { useState } from 'react';
import { ArrowRight, Phone, ShieldCheck } from 'lucide-react';
import { demoAccounts } from '@/lib/demo-accounts';
export function Login() {
  const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[demoCode,setDemoCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function send(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const r=await fetch('/api/auth/phone-number/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone})});
      const data=await r.json(); if(!r.ok) throw new Error(data.message||'Nu am putut trimite codul.');
      setSent(true);const inbox=await fetch('/api/dev/otp?phone='+encodeURIComponent(phone));setDemoCode((await inbox.json()).code||'');
    }catch(e){setError(e instanceof Error?e.message:'Eroare de conexiune.');}finally{setBusy(false);}
  }
  async function verify(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const r=await fetch('/api/auth/phone-number/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone,code})});
      const data=await r.json();if(!r.ok)throw new Error(data.message||'Cod invalid.');window.location.href='/cont';
    }catch(e){setError(e instanceof Error?e.message:'Eroare de conexiune.');setBusy(false);}
  }
  return <><form onSubmit={sent?verify:send} className="form"><div className="icon-box"><Phone size={24}/></div><h2>{sent?'Verifică numărul de telefon':'Bine ai venit în EduClar'}</h2><p>{sent?`Introdu codul pentru ${phone}.`:'Un singur cod. Fără o parolă de ținut minte.'}</p>{error&&<div className="notice error" role="alert">{error}</div>}{!sent?<label className="field"><span>Număr de telefon</span><input aria-label="Număr de telefon" aria-describedby="phone-hint" type="tel" name="phone" autoComplete="tel" placeholder="+40 7xx xxx xxx" value={phone} onChange={e=>setPhone(e.target.value.replace(/\s/g,''))} pattern="\+[1-9][0-9]{7,14}" required/><small id="phone-hint">Folosește prefixul internațional, de exemplu +40.</small></label>:<><label className="field"><span>Cod de verificare</span><input name="code" value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6} required autoFocus/></label>{demoCode&&<div className="notice amber"><strong>SMS simulat, exclusiv local</strong><br/>Cod de test: <button className="code-button" type="button" onClick={()=>setCode(demoCode)}>{demoCode}</button><small>Niciun SMS nu a fost trimis. Codul expiră în 5 minute.</small></div>}</>}<button className="button" disabled={busy}>{busy?'Se verifică…':sent?'Intră în cont':'Trimite codul'}<ArrowRight size={16}/></button>{sent&&<button type="button" className="text-button" onClick={()=>{setSent(false);setCode('');}}>Schimbă numărul</button>}<p className="small"><ShieldCheck size={14}/> Numărul tău nu apare în recenziile publice.</p></form><details className="demo-accounts" open><summary>Explorează rolurile cu un cont demo</summary><div className="demo-grid">{demoAccounts.map(a=><button key={a.phone} type="button" onClick={()=>{setPhone(a.phone);setSent(false);setCode('');setError('');}}><strong>{a.label}</strong><span>{a.phone}</span></button>)}</div></details></>;
}
export function Logout(){const[busy,setBusy]=useState(false);return <button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});window.location.href='/';}}>Ieși din cont</button>;}
