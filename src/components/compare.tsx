'use client';
import { createContext,useContext,useState,useEffect } from 'react';
import Link from 'next/link';
import { GitCompareArrows, X } from 'lucide-react';
type Item={id:string;name:string};
const Context=createContext<{selected:Item[];toggle:(s:Item)=>void}>({selected:[],toggle:()=>{}});
export function CompareProvider({children}:{children:React.ReactNode}) {
  const [selected,setSelected]=useState<Item[]>([]),[notice,setNotice]=useState('');
  useEffect(()=>{try{setSelected(JSON.parse(localStorage.getItem('educlar-compare')||'[]').slice(0,3));}catch{}},[]);
  function toggle(s:Item) {setSelected(old=>{let next;if(old.some(x=>x.id===s.id)) next=old.filter(x=>x.id!==s.id);else if(old.length>=3){setNotice('Poți compara cel mult trei instituții.');return old;}else next=[...old,s];localStorage.setItem('educlar-compare',JSON.stringify(next));setNotice('');return next;});}
  return <Context.Provider value={{selected,toggle}}>{children}{!!selected.length&&<aside className="compare-tray" aria-label="Instituții selectate pentru comparație"><GitCompareArrows size={20}/><span><strong>{selected.length} din 3</strong> școli selectate</span><div className="compare-names">{selected.map(s=><button key={s.id} onClick={()=>toggle(s)} aria-label={`Elimină ${s.name}`}>{s.name.split(' ').slice(-1)}<X size={12}/></button>)}</div><Link className="button" href={`/compara?ids=${selected.map(s=>encodeURIComponent(s.id)).join(',')}`}>Compară</Link>{notice&&<span role="status">{notice}</span>}</aside>}</Context.Provider>;
}
export function CompareToggle({school}:{school:Item}) {const {selected,toggle}=useContext(Context);return <label className="compare-toggle"><input type="checkbox" checked={selected.some(s=>s.id===school.id)} onChange={()=>toggle(school)}/>Compară<span className="sr-only"> {school.name}</span></label>;}
