import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUp, Check, ChevronDown, ClipboardPaste, Grip, History, Layers, MessageCircle, Minus, Monitor, MousePointer2, Paperclip, Pin, Plus, Settings as SettingsIcon, SlidersHorizontal, Square, X } from 'lucide-react';
import { defaults, providerNames, type ProviderId, type ProviderConfig, type Attachment, type Conversation, type Message, type Mode, type Settings } from './domain/types';
import { bridge, isDesktop } from './infrastructure/bridge';
import { IconButton } from './components/IconButton';
import { ChatContent } from './components/ChatContent';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { installPassiveInput } from './infrastructure/passive-input';
import {ProviderPicker} from './components/ProviderPicker';
import './provider-settings.css';

const uid = () => crypto.randomUUID();
export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'history'>('chat');
  const [mode, setMode] = useState<Mode>('passive');
  const [clickThrough, setClickThrough] = useState(false);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compact, setCompact] = useState(false);
  const [typing,setTyping]=useState(false);
  const request = useRef<{ id: string; conversationId: string } | null>(null);
  const lastAppearance = useRef<string | null>(null);
  const historyChanged = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const current = conversations.find(c => c.id === currentId);
  const messages = current?.messages ?? [];
  useEffect(installPassiveInput,[]);
  useEffect(()=>{const listener=(event:Event)=>{const url=(event as CustomEvent<string>).detail;addImage(url,'Clipboard image');};window.addEventListener('saa-paste-image',listener);return()=>window.removeEventListener('saa-paste-image',listener);});

  useEffect(() => { let active = true; bridge.load().then(data => {
    if (!active) return;
    setSettings({ ...defaults, ...data.settings }); setConversations(data.conversations);
    setCurrentId([...data.conversations].sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id??null);
    setMode(data.mode); setClickThrough(data.clickThrough); setCompact(!!data.compact); setLoaded(true);
    if (data.storageWarning) setError(data.storageWarning);
    if (data.shortcutsFailed?.length) setError(`Some shortcuts could not register: ${data.shortcutsFailed.join(', ')}. Close apps using them and restart SAA.`);
  }).catch(err => { if (active) setError(`Could not load local data: ${String(err)}`); }); return () => { active = false; }; }, []);

  useEffect(() => { if (!loaded) return; if (!historyChanged.current) { historyChanged.current = true; return; } if(busy)return;void bridge.saveConversations(conversations).catch(err => setError(`Could not save history: ${String(err)}`)); }, [conversations, loaded,busy]);
  useEffect(() => { if (!loaded) return; const fingerprint = `${settings.opacity}:${settings.alwaysOnTop}`; if (lastAppearance.current === null) { lastAppearance.current = fingerprint; return; } if (lastAppearance.current === fingerprint) return; const timer = setTimeout(() => { bridge.saveAppearance({ opacity: settings.opacity, alwaysOnTop: settings.alwaysOnTop }).then(() => { lastAppearance.current = fingerprint; }).catch(err => setError(`Could not save appearance: ${String(err)}`)); }, 350); return () => clearTimeout(timer); }, [settings.opacity, settings.alwaysOnTop, loaded]);
  useEffect(() => { if (messages.length) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'auto' }); }, [messages.length, messages.at(-1)?.content]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);

  const updateMessages = useCallback((id: string, fn: (list: Message[]) => Message[]) => {
    setConversations(list => list.map(c => c.id === id ? { ...c, messages: fn(c.messages), updatedAt: Date.now() } : c));
  }, []);
  useEffect(() => bridge.onChat(event => {
    const pending = request.current;
    if (!pending || event.id !== pending.id) return;
    if (event.type === 'delta') updateMessages(pending.conversationId, list => list.map((m, i) => i === list.length-1 ? { ...m, content: m.content + (event.text ?? '') } : m));
    else {
      request.current = null; setBusy(false);
      if (event.type === 'error') { setError(event.text || 'The request failed. Check your API settings and retry.'); updateMessages(pending.conversationId, list => list.filter(m => m.role !== 'assistant' || m.content.length > 0)); }
    }
  }), [updateMessages]);

  const send = useCallback(async (text = draft, attachments = images, retryMessages?: Message[]) => {
    if (request.current || (!text.trim() && !attachments.length && !retryMessages)) return;
    setError('');
    if (!loaded) { setError('Local data has not loaded. Restart SAA before sending.'); return; }
    if (!settings.model.trim()) { setError('Add your API endpoint and model in Settings first.'); setView('settings'); return; }
    const id = currentId ?? uid();
    const before = retryMessages ?? [...messages, { id: uid(), role: 'user' as const, content: text.trim(), images: attachments.length ? attachments : undefined }];
    if (new Blob([JSON.stringify(before)]).size > 22 * 1024 * 1024) { setError('This conversation and its images are too large. Remove an attachment or start a new chat.'); return; }
    const next: Message[] = [...before, { id: uid(), role: 'assistant', content: '' }];
    const requestId = uid(); request.current = { id: requestId, conversationId: id };
    setBusy(true); setCurrentId(id); setDraft(''); setImages([]); setView('chat');
    setConversations(list => list.some(c => c.id === id) ? list.map(c => c.id === id ? { ...c, messages: next, updatedAt: Date.now() } : c) : [...list, { id, title: (text.trim() || 'Image question').slice(0, 80), updatedAt: Date.now(), messages: next }]);
    try {
      await bridge.startChat({ id: requestId, conversation:{id,title:conversations.find(c=>c.id===id)?.title||(text.trim()||'Image question').slice(0,80),updatedAt:Date.now(),messages:next}, messages: before.map(m => ({ role: m.role, content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map(image => ({ type: 'image_url', image_url: { url: image.url } }))] : m.content })) });
    } catch (err) {
      if (request.current?.id !== requestId) return;
      request.current = null; setBusy(false); setError(err instanceof Error ? err.message : String(err));
      updateMessages(id, list => list.filter(m => m.role !== 'assistant' || !!m.content));
    }
  }, [draft, images, loaded, settings.model, currentId, messages,conversations, updateMessages]);

  const addImage = useCallback((url: string, name = 'Screen context') => {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(url)) { setError('Use a PNG, JPEG or WebP image.'); return; }
    if (url.length > 8 * 1024 * 1024) { setError('Choose an image smaller than 6 MB.'); return; }
    setImages(list => { if (list.length >= 4) { setError('You can attach up to four images.'); return list; } return [...list, { id: uid(), name, url }]; });
  }, []);
  useEffect(() => bridge.onAction(event => {
    if (event.type === 'settings' && event.settings) setSettings(event.settings);
    if (event.type === 'compact') setCompact(!!event.compact);
    if (event.type === 'error') setError(event.text || 'The desktop action failed.');
    if (event.type === 'typing')setTyping(!!event.active);
    if (event.type === 'mode' && event.mode) { setMode(event.mode); if (event.mode === 'interactive') textarea.current?.focus(); }
    if (event.type === 'clickThrough') setClickThrough(!!event.clickThrough);
    if (event.type === 'capture' && event.image) { addImage(event.image); setNotice('Screen captured. Review it before sending.'); }
    if (event.type === 'clipboard') {
      if (event.image) { addImage(event.image, 'Clipboard image'); setNotice('Clipboard image attached. Review it before sending.'); }
      else if (event.text?.trim()) void send(event.text, []);
      else setError('Clipboard is empty. Copy text or an image, then press Ctrl+Shift+Q.');
    }
  }), [send, addImage]);

  async function action(value: Parameters<typeof bridge.windowAction>[0]) {
    try { await bridge.windowAction(value);
      if (!isDesktop && value === 'mode') setMode(mode === 'passive' ? 'interactive' : 'passive');
      if (!isDesktop && value === 'clickThrough') setClickThrough(!clickThrough);
    } catch (err) { setError(String(err)); }
  }
  async function paste() { try { const data = await bridge.clipboard(); if (data.text) setDraft(d => d + data.text); if (data.image) addImage(data.image, 'Clipboard image'); if (!data.text && !data.image) setNotice('Clipboard is empty.'); } catch { setError('Clipboard could not be read. Try Ctrl+V in interactive mode.'); } }
  async function capture() { try { addImage(await bridge.capture()); setNotice('Screen captured. Review it before sending.'); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }
  async function readFile(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) { setError('Choose a PNG, JPEG or WebP image smaller than 6 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => addImage(String(reader.result), file.name); reader.onerror = () => setError('Could not read image.'); reader.readAsDataURL(file);
  }
  async function stop() { const pending = request.current; if (!pending) return; request.current = null; setBusy(false); await bridge.cancelChat(pending.id).catch(err => setError(String(err))); updateMessages(pending.conversationId, list => list.filter(m => m.role !== 'assistant' || !!m.content)); }
  function newChat() { if (busy) return; setCurrentId(null); setDraft(''); setImages([]); setError(''); setView('chat'); }
  function retry() { const lastUser = messages.findLastIndex(m => m.role === 'user'); if (lastUser >= 0) void send('', [], messages.slice(0, lastUser+1)); }
  async function saveSettings(value: Settings) { const saved = await bridge.saveSettings(value); setSettings(saved); setNotice('Settings saved.'); }
  async function saveProvider(id:ProviderId,patch:Partial<ProviderConfig>){setSettings(await bridge.saveProvider(id,patch));setNotice(patch.clearApiKey?'Provider key removed.':'Provider key saved.');}
  async function selectProvider(id:ProviderId){try{setSettings(await bridge.selectProvider(id));setNotice(`${providerNames[id]} selected for new messages.`);}catch(e){setError(e instanceof Error?e.message:String(e));}}
  async function savePrivacy(enabled:boolean){setSettings(await bridge.savePrivacy({captureExclusion:enabled}));setNotice(enabled?'Screen capture exclusion enabled.':'Screen capture exclusion disabled.');}
  const style = { '--panel-opacity': settings.opacity } as CSSProperties;
  return <main className={`app-shell ${compact ? 'compact' : ''}`} style={style}>
    <header className="toolbar">
      <div className="brand"><MessageCircle className="brand-icon"/><span>SAA</span></div><span className="toolbar-divider"/><button className={`chat-tab ${view === 'chat' ? 'selected' : ''}`} onClick={() => setView('chat')}>Chat</button>
      <nav><button className={view === 'history' ? 'active' : ''} disabled={busy} onClick={() => setView(view === 'history' ? 'chat' : 'history')}><History size={21}/><span>History</span></button><button className={view === 'settings' ? 'active' : ''} disabled={busy} onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}><SettingsIcon size={21}/><span>Settings</span></button><IconButton className={`icon-button pin ${settings.alwaysOnTop ? 'active' : ''}`} label={settings.alwaysOnTop ? 'Unpin overlay' : 'Keep on top'} onClick={() => setSettings(s => ({ ...s, alwaysOnTop: !s.alwaysOnTop }))}><Pin size={20}/></IconButton><IconButton className="icon-button compact-button" label={compact ? 'Expand panel' : 'Compact panel'} onClick={() => { setCompact(!compact); void action('compact'); }}><Grip size={21}/></IconButton><IconButton className="icon-button" label="Hide overlay · Ctrl+Shift+Space" onClick={() => isDesktop ? void action('hide') : setNotice('Show / hide works in the desktop app.')}><Minus size={21}/></IconButton></nav>
    </header>
    {view === 'chat' ? <>
      <div className="model-bar"><span className={`status-dot ${settings.model ? 'connected' : ''}`}/><ProviderPicker value={settings.activeProvider} disabled={busy} onChange={id=>void selectProvider(id)}/><span className="toolbar-divider"/><button className="model-button model-name" disabled={busy} onClick={() => setView('settings')}>{settings.model || 'Your model'}<ChevronDown size={15}/></button><div className="message-toggle"><button className={latest ? 'selected' : ''} onClick={() => setLatest(true)}>Latest</button><button className={!latest ? 'selected' : ''} onClick={() => setLatest(false)}>All messages</button></div>{messages.length > 0 && <IconButton label="New chat" className="icon-button" onClick={newChat} disabled={busy}><Plus size={18}/></IconButton>}</div>
      <div className="chat-scroll" ref={scroll}><ChatContent messages={messages} latest={latest} busy={busy} onPrompt={setDraft} onRetry={retry}/></div>
      <div className="composer-area"><div className="followups">{['Make it simpler', 'Go deeper', 'Give an example'].map(t => <button key={t} disabled={busy} onClick={() => messages.length ? void send(t) : setDraft(t)}>{t}</button>)}</div>
        {(error || notice) && <div className={`inline-notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><IconButton className="icon-button" label="Dismiss notice" onClick={() => { setError(''); setNotice(''); }}><X size={14}/></IconButton></div>}
        {images.length > 0 && <div className="attachments">{images.map(img => <div key={img.id}><img src={img.url} alt={img.name}/><IconButton className="remove-image" label={`Remove ${img.name}`} onClick={() => setImages(list => list.filter(i => i.id !== img.id))}><X size={12}/></IconButton></div>)}</div>}
        <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}><IconButton className="icon-button attach-button" label="Attach image" title={isDesktop && mode === 'passive' ? 'Attach a clipboard image without leaving fullscreen. Use interactive mode to browse files.' : 'Attach image'} disabled={busy} onClick={() => isDesktop && mode === 'passive' ? void paste() : fileInput.current?.click()}><Paperclip size={23}/></IconButton><span className="composer-divider"/><textarea ref={textarea} aria-label="Message" placeholder="Ask anything, or paste an image…" rows={1} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} onPaste={e => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); files.forEach(file => void readFile(file)); } }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><IconButton className="icon-button paste-button" label="Paste clipboard without taking focus" disabled={busy} onClick={() => void paste()}><ClipboardPaste size={20}/></IconButton>{busy ? <IconButton className="send-button" label="Stop response" onClick={() => void stop()}><Square size={19}/></IconButton> : <button className="send-button" title="Send message" aria-label="Send message" disabled={!draft.trim() && !images.length}><ArrowUp size={24}/></button>}</form>
        <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { [...(e.target.files ?? [])].forEach(file => void readFile(file)); e.target.value = ''; }}/>
      </div>
    </> : <div className="panel-scroll">{view === 'settings' ? <><div className="passive-hint">{isDesktop && mode === 'passive' ? 'Click a field to type without leaving fullscreen. Esc releases typing to the browser.' : !isDesktop ? 'Browser preview · use the desktop app for API access and native overlay features.' : 'Interactive mode · Ctrl+Alt+I returns to passive overlay.'}</div><SettingsPanel value={settings} onSave={saveSettings} onSaveProvider={saveProvider} onValidate={(id,config)=>bridge.validateProvider(id,config)} onPrivacyChange={savePrivacy} onClose={() => setView('chat')}/></> : <HistoryPanel items={conversations} onOpen={c => { setCurrentId(c.id); setView('chat'); setError(''); }} onDelete={id => { setConversations(list => list.filter(c => c.id !== id)); if (currentId === id) setCurrentId(null); }} onNew={newChat} onClose={() => setView('chat')}/>}</div>}
    <footer className="utility-bar"><SlidersHorizontal size={17}/><input aria-label="Panel opacity" type="range" min="35" max="100" value={Math.round(settings.opacity*100)} onChange={e => setSettings(s => ({ ...s, opacity: Number(e.target.value)/100 }))}/><span className="opacity-value">{Math.round(settings.opacity*100)}%</span><span className="toolbar-divider"/><button className={`mode-button ${mode === 'passive' ? 'active' : ''}`} onClick={() => void action('mode')} title="Ctrl+Alt+I · interactive mode may exit browser fullscreen"><Layers size={19}/><span>{mode === 'passive' ? 'Passive overlay' : 'Interactive mode'}</span><span className={`switch small ${mode === 'passive' ? 'on' : ''}`}><span/></span></button><IconButton className={`icon-button ${clickThrough ? 'active' : ''}`} label="Toggle click-through · Ctrl+Shift+X to restore mouse input" onClick={() => void action('clickThrough')}><MousePointer2 size={16}/></IconButton><IconButton className="icon-button" label="Capture screen for review · Ctrl+Alt+S" disabled={busy} onClick={() => void capture()}><Monitor size={17}/></IconButton><div className="shortcut"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd><span className="toolbar-divider"/><span>Show / hide</span></div></footer>
    <div className="status-footer">{typing ? 'Typing in SAA · Esc or click outside to return to the browser' : clickThrough ? 'Click-through enabled · Ctrl+Shift+X restores mouse input' : !isDesktop ? 'Browser preview · launch SAA for native overlay and API access' : !settings.model ? 'Connect your API in Settings' : mode === 'passive' ? <><Check size={12}/>Click a field to type · Browser keeps focus</> : 'Interactive mode · Ctrl+Alt+I returns to passive overlay'}</div>
    {view !== 'chat' && (error || notice) && <div className={`floating-notice ${error ? 'error' : ''}`} role="status" onClick={() => { setError(''); setNotice(''); }}>{error || notice}</div>}
  </main>;
}






