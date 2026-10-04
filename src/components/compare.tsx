'use client';
import { createContext,useContext,useState,useEffect } from 'react';
import Link from 'next/link';
import { GitCompareArrows, X } from 'lucide-react';
type Item={id:string;name:string};
const Context=createContext<{selected:Item[];toggle:(s:Item)=>void}>({selected:[],toggle:()=>{}});
export function CompareProvider({children}:{children:React.ReactNode}) {
  const [selected,setSelected]=useState<Item[]>([]),[notice,setNotice]=useState('');
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('educlar-compare')||'[]');if(Array.isArray(saved))setSelected(saved.filter((s:Item)=>s&&typeof s.id==='string'&&typeof s.name==='string').filter((s:Item,i:number,all:Item[])=>all.findIndex(x=>x.id===s.id)===i).slice(0,3));}catch{}},[]);
  function toggle(s:Item) {
    let next:Item[];
    if(selected.some(x=>x.id===s.id))next=selected.filter(x=>x.id!==s.id);
    else if(selected.length>=3){setNotice('Poți compara cel mult trei instituții.');return;}
    else next=[...selected,s];
    setSelected(next);setNotice('');
    try{if(next.length)localStorage.setItem('educlar-compare',JSON.stringify(next));else localStorage.removeItem('educlar-compare');}catch{setNotice('Selecția este disponibilă în această pagină; browserul nu permite salvarea.');}
  }
  return <Context.Provider value={{selected,toggle}}>{children}{!!selected.length&&<aside className="compare-tray" aria-label="Instituții selectate pentru comparație"><GitCompareArrows size={20}/><span><strong>{selected.length} din 3</strong> școli selectate</span><div className="compare-names">{selected.map(s=><button key={s.id} onClick={()=>toggle(s)} aria-label={`Elimină ${s.name}`}>{s.name.split(' ').slice(-1)}<X size={12}/></button>)}</div><Link className="button" href={`/compara?ids=${selected.map(s=>encodeURIComponent(s.id)).join(',')}`}>Compară</Link>{notice&&<span role="status">{notice}</span>}</aside>}</Context.Provider>;
}
export function CompareToggle({school}:{school:Item}) {const {selected,toggle}=useContext(Context);return <label className="compare-toggle"><input type="checkbox" checked={selected.some(s=>s.id===school.id)} onChange={()=>toggle(school)}/>Compară<span className="sr-only"> {school.name}</span></label>;}
