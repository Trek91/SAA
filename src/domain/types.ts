export type ProviderId='openai'|'openrouter'|'custom'|'local';
export interface ProviderConfig {
  endpoint: string; model: string; apiKey: string; hasKey?: boolean; clearApiKey?: boolean;
  headers: string; systemPrompt: string; bodyTemplate: string; responsePath: string;
  streamPath: string; stream: boolean; temperature:number|null; maxTokens:number|null; tokenParameter:'max_tokens'|'max_completion_tokens';modelsEndpoint:string;
}
export interface Settings extends ProviderConfig {opacity:number;alwaysOnTop:boolean;captureExclusion:boolean;activeProvider:ProviderId;providers:Record<ProviderId,ProviderConfig>}
export interface Attachment { id: string; name: string; url: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; images?: Attachment[] }
export interface Conversation { id: string; title: string; updatedAt: number; messages: Message[] }
export type Mode = 'passive' | 'interactive';
export interface ChatEvent { id: string; type: 'delta' | 'done' | 'error'; text?: string }
export interface ActionEvent { type: 'clipboard' | 'capture' | 'mode' | 'clickThrough' | 'settings' | 'compact' | 'error' | 'typing'; text?: string; image?: string; mode?: Mode; clickThrough?: boolean; compact?: boolean; settings?: Settings; active?:boolean }
export interface PassiveEvent {type:'pointer'|'key';kind?:'down'|'up'|'move'|'wheel'|'leave';seq?:number;x?:number;y?:number;width?:number;height?:number;delta?:number;key?:string;text?:string;ctrl?:boolean;shift?:boolean}
const connectionDefaults:ProviderConfig = {
  endpoint: 'https://api.openai.com/v1/chat/completions', model: '', apiKey: '', headers: '{}',
  systemPrompt: 'You are a helpful AI assistant. Give clear, accurate answers.', bodyTemplate: '',
  responsePath: 'choices.0.message.content', streamPath: 'choices.0.delta.content',
  stream: true, temperature:null,maxTokens:null,tokenParameter:'max_completion_tokens',modelsEndpoint:'',
};
export const providerNames:Record<ProviderId,string>={openai:'OpenAI',openrouter:'OpenRouter',custom:'Custom',local:'Local'};
export const providerDefaults:Record<ProviderId,ProviderConfig>={
  openai:{...connectionDefaults,endpoint:'https://api.openai.com/v1'},
  openrouter:{...connectionDefaults,endpoint:'https://openrouter.ai/api/v1',tokenParameter:'max_tokens'},
  custom:{...connectionDefaults,endpoint:'https://api.example.com/v1',tokenParameter:'max_tokens'},
  local:{...connectionDefaults,endpoint:'http://localhost:1234/v1',tokenParameter:'max_tokens'},
};
export const defaults:Settings={...providerDefaults.openai,opacity:.86,alwaysOnTop:true,captureExclusion:true,activeProvider:'openai',providers:providerDefaults};
export interface DesktopBridge {
  load(): Promise<{ settings: Settings; conversations: Conversation[]; mode: Mode; clickThrough: boolean; shortcutsFailed?: string[]; compact?: boolean; storageWarning?: string }>;
  saveSettings(value: Settings): Promise<Settings>;
  selectProvider(id:ProviderId):Promise<Settings>;
  saveProvider(id:ProviderId,patch:Partial<ProviderConfig>):Promise<Settings>;
  validateProvider(id:ProviderId,patch:ProviderConfig):Promise<{models:string[];message:string}>;
  savePrivacy(value:{captureExclusion:boolean}):Promise<Settings>;
  saveAppearance(value: { opacity: number; alwaysOnTop: boolean }): Promise<Settings>;
  writeClipboard(text: string): Promise<unknown>;
  saveConversations(value: Conversation[]): Promise<unknown>;
  startChat(value: { id: string; conversation:Conversation; messages: { role: string; content: unknown }[] }): Promise<unknown>;
  cancelChat(id: string): Promise<unknown>;
  onChat(callback: (event: ChatEvent) => void): () => void;
  onAction(callback: (event: ActionEvent) => void): () => void;
  onPassiveInput(callback:(event:PassiveEvent)=>void):()=>void;
  passiveControl(action:'type'|'release'|'drag'):Promise<unknown>;
  windowAction(action: 'hide' | 'mode' | 'clickThrough' | 'pin' | 'compact' | 'quit'): Promise<unknown>;
  clipboard(): Promise<{ text: string; image?: string }>;
  capture(): Promise<string>;
}
declare global { interface Window { saa?: DesktopBridge } }
