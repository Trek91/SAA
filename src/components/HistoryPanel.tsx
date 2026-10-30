import { ArrowLeft, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { Conversation } from '../domain/types';
import { IconButton } from './IconButton';
export function HistoryPanel({ items, onOpen, onDelete, onNew, onClose }: { items: Conversation[]; onOpen: (c: Conversation) => void; onDelete: (id: string) => void; onNew: () => void; onClose: () => void }) {
  return <section className="history-panel"><div className="section-heading"><IconButton className="icon-button" label="Back to chat" onClick={onClose}><ArrowLeft size={20}/></IconButton><div><h1>Your conversations.</h1><p>Saved on this computer.</p></div><button className="secondary-button push-right" onClick={onNew}><Plus size={16}/>New chat</button></div>
    {items.length === 0 ? <div className="history-empty"><MessageSquare size={32}/><p>A fresh start.</p><span>Your conversations will appear here.</span></div> : <div className="history-list">{[...items].sort((a,b) => b.updatedAt-a.updatedAt).map(c => <div className="history-row" key={c.id}><button className="history-open" onClick={() => onOpen(c)}><MessageSquare size={18}/><span><strong>{c.title}</strong><small>{new Date(c.updatedAt).toLocaleString()} · {c.messages.length} messages</small></span></button><IconButton className="icon-button" label={`Delete ${c.title}`} onClick={() => onDelete(c.id)}><Trash2 size={16}/></IconButton></div>)}</div>}
  </section>;
}
