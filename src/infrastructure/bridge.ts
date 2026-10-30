import { defaults, type DesktopBridge, type Settings } from '../domain/types';
export const isDesktop = !!window.saa;
let previewSettings=defaults;
// The browser preview is deliberately local-only. Credentials and HTTP belong to the desktop host.
export const bridge: DesktopBridge = window.saa ?? {
  async load() {
    let conversations = [];
    try { conversations = JSON.parse(localStorage.getItem('saa.preview.history') ?? '[]'); } catch { /* recover empty history */ }
    return { settings: previewSettings, conversations: Array.isArray(conversations) ? conversations : [], mode: 'passive', clickThrough: false };
  },
  async saveSettings(value) { previewSettings={...value,apiKey:'',hasKey:false,providers:Object.fromEntries(Object.entries(value.providers).map(([id,p])=>[id,{...p,apiKey:'',hasKey:false}]))as Settings['providers']};return previewSettings; },
  async selectProvider(id){previewSettings={...previewSettings,...previewSettings.providers[id],activeProvider:id};return previewSettings;},
  async saveProvider(){throw new Error('Open SAA desktop to save provider credentials.');},
  async validateProvider(){throw new Error('Open SAA desktop to validate your provider.');},
  async savePrivacy(value){previewSettings={...previewSettings,...value};return previewSettings;},
  async saveAppearance(value) { previewSettings={...previewSettings,...value};return previewSettings; },
  async writeClipboard(text) { await navigator.clipboard.writeText(text); },
  onPassiveInput(){return ()=>{};},async passiveControl(){},
  async saveConversations(value) { localStorage.setItem('saa.preview.history', JSON.stringify(value)); },
  async startChat() { throw new Error('Open the SAA desktop app to connect your API. The browser is a UI preview.'); },
  async cancelChat() {}, onChat() { return () => {}; }, onAction() { return () => {}; }, async windowAction() {},
  async clipboard() { return { text: await navigator.clipboard.readText() }; },
  async capture() { throw new Error('Screen capture is available in the desktop app.'); },
};
