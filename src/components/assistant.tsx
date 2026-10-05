'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Sparkles, Trash2, X } from 'lucide-react';
import type { ChatMessage } from '@/lib/assistant';

type Message = ChatMessage & { cached?: boolean };
type Status = {configured:boolean;remaining?:number;dailyLimit?:number;available?:boolean};
const suggestions = ['Explică-mi o idee dificilă pe înțelesul meu.','Ajută-mă să îmi organizez săptămâna.','Cum compar două școli pe EduClar?'];
export function AssistantWidget({signedIn}:{signedIn:boolean}) {
  const pathname = usePathname();
  return pathname === '/asistent' ? null : <Assistant signedIn={signedIn}/>;
}
export function Assistant({signedIn,fullPage=false}:{signedIn:boolean;fullPage?:boolean}) {
  const [open,setOpen] = useState(fullPage), [messages,setMessages] = useState<Message[]>([]);
  const [draft,setDraft] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [status,setStatus] = useState<Status|null>(null);
  const pending = useRef(false), end = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open || !signedIn) return;
    const controller = new AbortController();
    fetch('/api/chat',{signal:controller.signal}).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error); setStatus(data);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Nu am putut conecta asistentul.'); });
    input.current?.focus();
    return () => controller.abort();
  },[open,signedIn]);
  useEffect(() => { end.current?.scrollIntoView({block:'nearest'}); },[messages,busy]);
  function close() { setOpen(false); trigger.current?.focus(); }
  async function send(event:React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const message: Message = {role:'user',content:draft.trim()};
    const context: ChatMessage[] = [...messages.slice(-8).map(({role,content})=>({role,content})),message];
    while (context.length>1 && (context.reduce((n,m)=>n+m.content.length,0)>8000 || context.some(m=>m.content.length>6000))) context.splice(0,2);
    try {
      const response = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:context})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Mesajul nu a putut fi trimis.');
      setMessages(previous => [...previous,message,{role:'assistant',content:data.reply,cached:data.cached}]);
      setDraft(''); setStatus({configured:true,remaining:data.remaining,dailyLimit:data.dailyLimit,available:data.available});
    } catch(e) { setError(e instanceof Error ? e.message : 'Eroare de conexiune.'); }
    finally { pending.current = false; setBusy(false); input.current?.focus(); }
  }
  async function clear() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/chat',{method:'DELETE'}); const data = await response.json();
      if (!response.ok) throw new Error(data.error); setMessages([]); setDraft('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Nu am putut șterge conversația.'); }
    finally { pending.current=false;setBusy(false); }
  }
  const disabled = busy || !status?.configured;
  return <>{!fullPage && <button ref={trigger} className="assistant-trigger" aria-label={open?'Închide Jelly':'Deschide Jelly'} aria-expanded={open} aria-controls="jelly-panel" onClick={()=>open?close():setOpen(true)}><MessageCircle size={21}/><span>Jelly</span></button>}
    {open && <section id={fullPage?'jelly-page':'jelly-panel'} className={`assistant-panel ${fullPage?'assistant-full':''}`} aria-label="Jelly, asistent AI" onKeyDown={e=>{if(e.key==='Escape'&&!fullPage)close();}}>
      <div className="assistant-heading"><div><Sparkles size={20}/><div><strong>Jelly</strong><p>Un pic de ajutor, pentru orice idee.</p></div></div><div>{signedIn&&<button className="assistant-icon" aria-label="Șterge conversația și răspunsurile salvate" disabled={busy} onClick={clear}><Trash2 size={17}/></button>}{!fullPage&&<button className="assistant-icon" aria-label="Închide asistentul" onClick={close}><X size={20}/></button>}</div></div>
      {!signedIn ? <div className="assistant-welcome"><Sparkles size={30}/><h2>Cu ce te pot ajuta?</h2><p>Explicații, idei, scris sau întrebări despre EduClar. Intră în cont pentru a începe.</p><Link className="button" href="/autentificare">Intră în cont</Link></div> : <>
        <div className="assistant-messages" role="log" aria-label="Conversație cu Jelly" aria-live="polite" aria-busy={busy}>
          {!messages.length && <div className="assistant-welcome"><Sparkles size={28}/><h2>Cu ce te pot ajuta?</h2><p>De la o explicație pentru școală la o idee nouă. Începem cu o întrebare.</p><div className="assistant-suggestions">{suggestions.map(s=><button key={s} disabled={disabled} onClick={()=>{setDraft(s);input.current?.focus();}}>{s}</button>)}</div></div>}
          {messages.map((m,i)=><div key={i} className={`assistant-message assistant-${m.role}`}><strong>{m.role==='user'?'Tu':'Jelly'}</strong><p>{m.content}</p>{m.cached&&<small>Răspuns salvat · fără un apel AI nou</small>}</div>)}
          {busy&&<p className="assistant-thinking" role="status">Jelly lucrează…</p>}<div ref={end}/>
        </div>
        <div className="assistant-compose">{error&&<div className="notice error" role="alert">{error}</div>}{status&&!status.configured&&<p role="status">Jelly așteaptă conectarea furnizorului AI.</p>}
          <form onSubmit={send}><label className="sr-only" htmlFor={fullPage?'jelly-page-input':'jelly-input'}>Mesaj pentru Jelly</label><textarea ref={input} id={fullPage?'jelly-page-input':'jelly-input'} rows={2} maxLength={2000} placeholder="Scrie o întrebare…" value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><button className="button" aria-label="Trimite mesajul" disabled={disabled||!draft.trim()}><Send size={18}/></button></form>
          <div className="assistant-footnote"><span>{status?.configured ? `${status.remaining}/${status.dailyLimit} răspunsuri noi azi · cele salvate nu consumă limita` : 'Mesajele sunt trimise doar când apeși Trimite.'}</span><span>{draft.length}/2000</span></div>
          <p className="small">Jelly poate greși. Nu trimite date personale. <Link href="/confidentialitate">Despre conversații</Link></p>
        </div>
      </>}
    </section>}
  </>;
}
