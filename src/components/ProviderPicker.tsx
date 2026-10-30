import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {providerNames,type ProviderId} from '../domain/types';
export function ProviderPicker({value,onChange,disabled=false,label='Active provider'}:{value:ProviderId;onChange:(id:ProviderId)=>void;disabled?:boolean;label?:string}){
 const[open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:Event)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[open]);
 return <div className="provider-picker" ref={root}><button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} className="provider-trigger" onClick={()=>setOpen(!open)}>{providerNames[value]}<ChevronDown size={15}/></button>{open&&!disabled&&<div className="provider-menu" role="menu" aria-label="AI providers">{(Object.keys(providerNames)as ProviderId[]).map(id=><button type="button" key={id} role="menuitemradio" aria-checked={value===id} onClick={()=>{onChange(id);setOpen(false);}}><span>{providerNames[id]}</span>{value===id&&<Check size={15}/>}</button>)}</div>}</div>;
}
