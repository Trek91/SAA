import { ArrowRight, Check, Copy, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { memo, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Message } from '../domain/types';
import { bridge } from '../infrastructure/bridge';
function CopyButton({ text, code=false }: { text: string; code?:boolean }) {
 const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle');
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <span className="copy-control"><button type="button" className="copy-output" aria-label={status==='copied'?'Copied':code?'Copy code':'Copy answer'} onClick={async()=>{try{await bridge.writeClipboard(text);setStatus('copied');clearTimeout(timer.current);timer.current=setTimeout(()=>setStatus('idle'),1800);}catch{setStatus('error');}}}>{status==='copied'?<Check size={14}/>:<Copy size={14}/>}<span>{status==='copied'?'Copied':code?'Copy code':'Copy answer'}</span></button>{status==='error'&&<span className="copy-error" role="alert">Copy failed. Try again or select text in interactive mode.</span>}</span>;
}
function CodeBlock({children,node}:{children?:ReactNode;node?:{children?:unknown[]}}){
 const element=node?.children?.[0] as {properties?:{className?:string[]};children?:unknown[]}|undefined;
 function raw(n:unknown):string {const v=n as {type?:string;value?:string;children?:unknown[]};return v.type==='text'?v.value??'':(v.children??[]).map(raw).join('');}
 const text=element?raw(element):'';
 const language=element?.properties?.className?.find(c=>c.startsWith('language-'))?.slice(9)||'text';
 return <div className="code-block"><div className="code-heading"><span>{language}</span><CopyButton text={text} code/></div><pre>{children}</pre></div>;
}
const Markdown=memo(function Markdown({content}:{content:string}){
 return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight,{detect:false,ignoreMissing:true}]]} components={{pre:CodeBlock,a:({children})=><span className="answer-link">{children}</span>,img:({alt})=><span className="answer-link">[Image: {alt||'external image blocked'}]</span>}}>{content}</ReactMarkdown>;
});
export function ChatContent({messages,latest,busy,onPrompt,onRetry}:{messages:Message[];latest:boolean;busy:boolean;onPrompt:(s:string)=>void;onRetry:()=>void}){
 if(!messages.length)return <div className="empty-chat"><div className="empty-eyebrow">SAA</div><h1>A little clarity, on demand.</h1><p>Ask a question, attach an image, or bring context from your screen.</p><div className="suggestions">{['Explain something','Help me write','Think it through'].map(text=><button key={text} onClick={()=>onPrompt(text)}>{text}<ArrowRight size={22}/></button>)}</div></div>;
 const visible=latest?messages.slice(-2):messages;
 return <div className="messages" aria-live="polite" aria-busy={busy}>{visible.map((m,index)=><article className={`message ${m.role}`} key={m.id}><div className="message-label">{m.role==='user'?'YOU':'SAA'}{m.role==='assistant'&&!!m.content&&<CopyButton text={m.content}/>}</div>{m.images?.length?<div className="message-images">{m.images.map(img=><img src={img.url} alt={img.name} key={img.id}/>)}</div>:null}<div className="markdown">{m.content?<Markdown content={m.content}/>:<span className="thinking">Thinking<span>…</span></span>}</div>{m.role==='assistant'&&index===visible.length-1&&!busy&&<button className="text-button retry" onClick={onRetry}><RefreshCw size={13}/>Retry</button>}</article>)}</div>;
}
