import { ArrowRight, Check, Copy, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import type { Message } from '../domain/types';
import { IconButton } from './IconButton';
import { bridge } from '../infrastructure/bridge';
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <IconButton className="icon-button" label={copied ? 'Copied' : 'Copy answer'} onClick={async () => { try { await bridge.writeClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</IconButton>;
}
export function ChatContent({ messages, latest, busy, onPrompt, onRetry }: { messages: Message[]; latest: boolean; busy: boolean; onPrompt: (s: string) => void; onRetry: () => void }) {
  if (!messages.length) return <div className="empty-chat"><div className="empty-eyebrow">SAA</div><h1>A little clarity, on demand.</h1><p>Ask a question, attach an image, or bring context from your screen.</p><div className="suggestions">{['Explain something', 'Help me write', 'Think it through'].map(text => <button key={text} onClick={() => onPrompt(text)}>{text}<ArrowRight size={22}/></button>)}</div></div>;
  const visible = latest ? messages.slice(-2) : messages;
  return <div className="messages" aria-live="polite" aria-busy={busy}>{visible.map((m, index) => <article className={`message ${m.role}`} key={m.id}><div className="message-label">{m.role === 'user' ? 'YOU' : 'SAA'}{m.role === 'assistant' && !!m.content && <CopyButton text={m.content}/>}</div>{m.images?.length ? <div className="message-images">{m.images.map(img => <img src={img.url} alt={img.name} key={img.id}/>)}</div> : null}<div className="markdown">{m.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{a: ({children}) => <span className="answer-link">{children}</span>}}>{m.content}</ReactMarkdown> : <span className="thinking">Thinking<span>…</span></span>}</div>{m.role === 'assistant' && index === visible.length-1 && !busy && <button className="text-button retry" onClick={onRetry}><RefreshCw size={13}/>Retry</button>}</article>)}</div>;
}
