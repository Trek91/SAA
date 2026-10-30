'use strict';

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, desktopCapturer, screen, safeStorage, Tray, Menu, nativeImage, session } = require('electron');
const fs = require('node:fs/promises');
const {mkdirSync}=require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cleanMessages, runChat, validateConnection } = require('./provider.cjs');
const {normalizeSettings,publicSettings: redactSettings,updateSettings,patchProvider,mergeProfile,assertProvider}=require('./settings.cjs');
const { createSettingsTransaction, backupUnreadable } = require('./storage.cjs');
const { readClipboardData, writeClipboardData } = require('./clipboard.cjs');
const { createPassiveInput } = require('./passive-input.cjs');
const {createHistoryStore}=require('./history.cjs');

app.setName('SAA');
if(!app.commandLine.hasSwitch('user-data-dir')){const dataPath=path.join(app.getPath('appData'),'SAA');mkdirSync(dataPath,{recursive:true});app.setPath('userData',dataPath);app.setPath('sessionData',dataPath);}
if(process.platform==='win32')app.setAppUserModelId('local.saa.assistant');
let win, tray, settings = normalizeSettings({}), mode = 'passive', clickThrough = false, compact = false, quitting = false;
let conversations = [], shortcutsFailed = [], storageWarning = '', normalBounds;
const active = new Map();
const activeTasks=new Set();
let historyStore,shutdownPending=false,quitAfterFlush=false;
const queues = new Map();
const blockedFiles = new Set();
let capturePending;
let captureProtectionDepth=0;
let passiveInput;
function updateInput(){passiveInput?.state(mode==='passive'&&!clickThrough&&win?.isVisible());}
function hideWindow(){passiveInput?.state(false);win.hide();updateTray();}
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const devURL = process.env.SAA_DEV_URL;
if (devURL && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(devURL)) throw new Error('SAA_DEV_URL must be a localhost development origin.');

function publicSettings() { return redactSettings(settings); }
function send(channel, value) { if (win && !win.isDestroyed()) win.webContents.send(channel, value); }
function state() { return { mode, clickThrough, compact, alwaysOnTop: settings.alwaysOnTop }; }

async function atomicWrite(file, data) {
  if (blockedFiles.has(file)) throw new Error('The original unreadable data could not be backed up. Free disk space or fix file permissions and restart SAA before saving.');
  const previous = queues.get(file) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try { await fs.writeFile(temporary, data, { mode: 0o600 }); await fs.rename(temporary, file); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  });
  queues.set(file, next);
  try { await next; } finally { if (queues.get(file) === next) queues.delete(file); }
}

async function readBounded(file, limit) {
  const stat = await fs.stat(file);
  if (stat.size > limit) throw new Error('Saved data exceeds the size limit.');
  return fs.readFile(file);
}

function validateHistory(value) {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Keep at most 200 conversations. Export or delete older chats first.');
  if (Buffer.byteLength(JSON.stringify(value)) > 24 * 1024 * 1024) throw new Error('History exceeds the 24 MB local storage limit.');
  for (const chat of value) {
    if (!chat || typeof chat.id !== 'string' || chat.id.length > 128 || typeof chat.title !== 'string' || chat.title.length > 10000 || !Number.isFinite(chat.updatedAt) || !Array.isArray(chat.messages)) throw new Error('Invalid conversation data.');
    if (chat.messages.length) cleanMessages(chat.messages);
    for (const message of chat.messages) {
      if (typeof message.id !== 'string' || typeof message.content !== 'string') throw new Error('Invalid saved message.');
      if (message.images !== undefined) {
        if (!Array.isArray(message.images) || message.images.length > 4) throw new Error('Invalid saved attachments.');
        for (const image of message.images) {
          if (!image || typeof image.id !== 'string' || typeof image.name !== 'string' || typeof image.url !== 'string' || image.url.length > 8 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.url)) throw new Error('Invalid saved image.');
        }
      }
    }
  }
  return value;
}

async function loadStorage() {
  const settingsFile = path.join(app.getPath('userData'), 'settings.enc');
  const historyFile = path.join(app.getPath('userData'), 'conversations.json');
  async function recover(file, label) {
    try {
      const backup = await backupUnreadable(file);
      storageWarning += `${label} could not be opened. The original was copied to ${path.basename(backup)} before allowing new saves. `;
    } catch {
      blockedFiles.add(file);
      storageWarning += `${label} could not be opened or backed up. Saving this file is blocked; fix permissions or free disk space and restart SAA. `;
    }
  }
  try {
    const encrypted = await readBounded(settingsFile, 1024 * 1024);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable.');
    settings = normalizeSettings(JSON.parse(safeStorage.decryptString(encrypted)));
  } catch (error) { if (error.code !== 'ENOENT') await recover(settingsFile, 'Saved settings'); }
  try { conversations = validateHistory(JSON.parse((await readBounded(historyFile, 24 * 1024 * 1024)).toString('utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') await recover(historyFile, 'Saved history'); }
  historyStore=createHistoryStore({initial:conversations,write:async next=>{validateHistory(next);await atomicWrite(historyFile,JSON.stringify(next));},onError:error=>send('saa:action',{type:'error',text:`Could not save chat history: ${error.message}`})});
}
function updateSavedAnswer(chatId,messageId,text){
  const next=historyStore.get().map(chat=>chat.id===chatId?{...chat,updatedAt:Date.now(),messages:chat.messages.map(message=>message.id===messageId?{...message,content:message.content+text}:message)}:chat);
  historyStore.replace(next,{defer:true});
}

function applyPin() {
  if (!win) return;
  win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
  if (settings.alwaysOnTop) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  else win.setVisibleOnAllWorkspaces(false);
}
function applyPrivacy(){
  if(!win||win.isDestroyed())return;
  win.setSkipTaskbar(true);
  win.setContentProtection(settings.captureExclusion||captureProtectionDepth>0);
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Hide SAA' : 'Show SAA (passive)', click: toggleVisible },
    { label: 'Passive overlay', type: 'checkbox', checked: mode === 'passive', click: () => setMode(mode === 'passive' ? 'interactive' : 'passive') },
    { label: 'Click through', type: 'checkbox', checked: clickThrough, click: toggleClickThrough },
    { label: 'Ask clipboard', click: askClipboard },
    { type: 'separator' }, { label: 'Quit SAA', click: () => app.quit() },
  ]));
}

function setMode(value) {
  passiveInput?.typing(false);
  mode = value;
  if (mode === 'interactive') {
    if (clickThrough) { clickThrough = false; win.setIgnoreMouseEvents(false); send('saa:action', { type: 'clickThrough', clickThrough }); }
    win.setFocusable(true); win.show(); win.focus();
  } else { win.setFocusable(false); win.showInactive(); }
  applyPrivacy();updateInput();send('saa:action', { type: 'mode', mode }); updateTray();
}

function showPassive() {
  clickThrough=false;win.setIgnoreMouseEvents(false);send('saa:action',{type:'clickThrough',clickThrough:false});
  // Only Windows has the native helper needed to type without activating SAA.
  if(process.platform==='darwin'){setMode('interactive');return;}
  mode = 'passive'; win.setFocusable(false); win.showInactive();
  applyPrivacy();
  updateInput();
  send('saa:action', { type: 'mode', mode }); updateTray();
}
function toggleVisible() { if (win.isVisible()) hideWindow(); else showPassive(); updateTray(); }
function toggleClickThrough() {
  clickThrough = !clickThrough;
  if (clickThrough) { mode = 'passive'; win.setFocusable(false); send('saa:action', { type: 'mode', mode }); }
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  updateInput();
  send('saa:action', { type: 'clickThrough', clickThrough }); updateTray();
}

async function readClipboard() { return readClipboardData(clipboard); }
async function askClipboard() {
  try { const value = await readClipboard(); showPassive(); send('saa:action', { type: 'clipboard', ...value }); }
  catch (error) { send('saa:action', { type: 'error', text: error.message }); }
}
function captureScreen() {
  if (capturePending) return capturePending;
  capturePending = (async () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    // Windows capture exclusion removes SAA from the image without hiding, showing,
    // activating, or changing focus in the fullscreen application behind it.
    const excluded = process.platform === 'win32' && win && !win.isDestroyed();
    if(excluded){captureProtectionDepth++;applyPrivacy();}
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 }, fetchWindowIcons: false });
      const source = sources.find((item) => item.display_id === String(display.id)) || sources[0];
      if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture is unavailable on this display.');
      return source.thumbnail.toDataURL();
    } finally { if(excluded){captureProtectionDepth--;applyPrivacy();} }
  })().finally(() => { capturePending = undefined; });
  return capturePending;
}
async function captureAction() {
  try { const image = await captureScreen(); send('saa:action', { type: 'capture', image }); }
  catch (error) { send('saa:action', { type: 'error', text: error.message }); }
}

function authorize(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted application request.');
  const url = event.senderFrame.url;
  if (devURL ? new URL(url).origin !== new URL(devURL).origin : url !== pathToFileURL(indexPath).href) throw new Error('Untrusted application origin.');
}
function handle(name, fn) { ipcMain.handle(`saa:${name}`, (event, ...args) => { authorize(event); return fn(...args); }); }

const settingsTransaction = createSettingsTransaction({
  get: () => settings,
  validate: normalizeSettings,
  persist: async (next) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable. Settings were not saved.');
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') throw new Error('Unlock a system keyring before saving credentials.');
    const encrypted=safeStorage.encryptString(JSON.stringify(next));
    if(encrypted.length>1024*1024)throw new Error('Provider settings exceed the 1 MB storage limit. Shorten headers, prompts or templates.');
    await atomicWrite(path.join(app.getPath('userData'), 'settings.enc'), encrypted);
  },
  commit: (next) => { settings = next; applyPin();applyPrivacy();send('saa:action', { type: 'settings', settings: publicSettings() }); },
});
async function mutateSettings(derive) { await settingsTransaction(derive); return publicSettings(); }

function setupIPC() {
  handle('load', () => ({ settings: publicSettings(), conversations:historyStore.get(), mode, clickThrough, compact, shortcutsFailed, storageWarning }));
  handle('saveSettings', async (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
    return mutateSettings((current) => updateSettings(current,input));
  });
  handle('selectProvider',id=>{assertProvider(id);if(active.size)throw new Error('Wait for the current answer before switching providers.');return mutateSettings(current=>({...current,activeProvider:id}));});
  handle('saveProvider',(id,patch)=>mutateSettings(current=>patchProvider(current,id,patch)));
  handle('validateProvider',(id,patch)=>{assertProvider(id);return validateConnection(mergeProfile(settings.providers[id],patch));});
  handle('saveAppearance', (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['opacity', 'alwaysOnTop'].includes(key))) throw new Error('Appearance accepts only opacity and alwaysOnTop.');
    return mutateSettings((current) => ({ ...current, ...input }));
  });
  handle('savePrivacy',(input)=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.captureExclusion!=='boolean')throw new Error('Privacy accepts only the capture exclusion switch.');
    return mutateSettings(current=>({...current,captureExclusion:input.captureExclusion}));
  });
  handle('saveConversations', async (value) => {
    // Streaming is owned here; an old renderer snapshot must not overwrite it.
    if(active.size)return false;
    const next = validateHistory(value);
    await historyStore.replace(next);return true;
  });
  handle('startChat', async (request) => {
    if (!request || typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.id)) throw new Error('Invalid request ID.');
    if (active.has(request.id)) throw new Error('This request is already running.');
    if (active.size) throw new Error('Stop the current answer before sending another message.');
    const messages = cleanMessages(request.messages), controller = new AbortController(), requestSettings = { ...settings };
    let chat,answerId;
    if(request.conversation!==undefined){
      chat=validateHistory([request.conversation])[0];
      const answer=chat.messages.at(-1);
      if(!answer||answer.role!=='assistant'||answer.content!==''||!answer.id)throw new Error('Invalid pending conversation.');
      answerId=answer.id;
    }
    active.set(request.id, controller);
    let finish;const completed=new Promise(resolve=>{finish=resolve;});activeTasks.add(completed);
    try{
      if(chat){const current=historyStore.get(),next=current.some(c=>c.id===chat.id)?current.map(c=>c.id===chat.id?chat:c):[...current,chat];validateHistory(next);await historyStore.replace(next);}
      if(controller.signal.aborted)throw Object.assign(new Error('Request cancelled.'),{name:'AbortError'});
    }catch(error){active.delete(request.id);activeTasks.delete(completed);finish();throw error;}
    // Start after the invocation reply, so the renderer can register the accepted ID.
    setImmediate(async () => {
      let event;
      try {
        await runChat(requestSettings, messages, { signal: controller.signal, onDelta: (text) => {if(controller.signal.aborted)return;if(chat)updateSavedAnswer(chat.id,answerId,text);send('saa:chat', { id: request.id, type: 'delta', text });} });
        event={id:request.id,type:'done'};
      } catch (error) {
        if(chat)historyStore.replace(historyStore.get().map(c=>c.id===chat.id?{...c,messages:c.messages.filter(m=>m.id!==answerId||!!m.content)}:c),{defer:true});
        event=error.name === 'AbortError' ? { id: request.id, type: 'done', cancelled: true } : { id: request.id, type: 'error', text: error.message };
      }
      try{await historyStore.flush();}catch(error){event={id:request.id,type:'error',text:`Could not save chat history: ${error.message}`};}
      active.delete(request.id);activeTasks.delete(completed);finish();send('saa:chat',event);
    });
    return { id: request.id };
  });
  handle('cancelChat', (id) => { if (typeof id === 'string') active.get(id)?.abort(); return true; });
  handle('clipboard', readClipboard);
  handle('writeClipboard', async (text) => writeClipboardData(clipboard, text));
  handle('capture', captureScreen);
  handle('passiveControl',(action)=>{
    if(action==='release')passiveInput?.typing(false);
    else if(mode==='passive'&&!clickThrough&&win.isVisible()){
      if(action==='type')passiveInput?.typing(true);
      else if(action==='drag')passiveInput?.drag();
      else throw new Error('Unknown input action.');
    }
    return true;
  });
  handle('windowAction', async (action) => {
    switch (action) {
      case 'hide': hideWindow(); break;
      case 'mode': setMode(mode === 'passive' ? 'interactive' : 'passive'); break;
      case 'clickThrough': toggleClickThrough(); break;
      case 'pin': await mutateSettings((current) => ({ ...current, alwaysOnTop: !current.alwaysOnTop })); break;
      case 'compact':
        compact = !compact;
        if (compact) { normalBounds = win.getBounds(); win.setMinimumSize(440, 260); win.setSize(480, 360); }
        else { win.setMinimumSize(600, 480); if (normalBounds) win.setBounds(normalBounds); }
        send('saa:action', { type: 'compact', compact }); break;
      case 'quit': app.quit(); break;
      default: throw new Error('Unknown window action.');
    }
    return state();
  });
}

function createTray() {
  const size = 32, pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, inside = (x - 15.5) ** 2 + (y - 15.5) ** 2 < 210;
    pixels[i] = 158; pixels[i + 1] = 214; pixels[i + 2] = 197; pixels[i + 3] = inside ? 255 : 0;
    if (inside && (Math.abs(x - 15.5) < 2 || Math.abs(y - 15.5) < 2)) { pixels[i] = 28; pixels[i + 1] = 36; pixels[i + 2] = 33; }
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: size, height: size }));
  tray.setToolTip('SAA · Ctrl+Shift+Space to show/hide'); tray.on('click', toggleVisible); updateTray();
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: Math.min(1100, area.width - 40), height: Math.min(760, area.height - 40), minWidth: 600, minHeight: 480,
    frame: false, transparent: true, backgroundColor: '#00000000', show: false, focusable: false,
    icon:path.join(__dirname,'..','build',process.platform==='darwin'?'icon-mac.png':'icon.ico'),
    skipTaskbar: true, alwaysOnTop: settings.alwaysOnTop, title: 'SAA',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: Boolean(devURL), spellcheck: false, backgroundThrottling: false },
  });
  applyPin();
  applyPrivacy();
  passiveInput=createPassiveInput(win,(event)=>{
    if(event.type==='typing')send('saa:action',{type:'typing',active:event.active});
    else if(event.type==='error')send('saa:action',event);
    else if(mode==='passive'&&!clickThrough&&win.isVisible())send('saa:passiveInput',event);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.once('ready-to-show', showPassive);
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); hideWindow(); } });
  win.on('hide',()=>passiveInput?.state(false));
  win.webContents.on('did-start-loading',()=>passiveInput?.typing(false));
  win.webContents.on('render-process-gone', () => { passiveInput?.state(false);for (const controller of active.values()) controller.abort(); active.clear(); });
  if (devURL) win.loadURL(devURL); else win.loadFile(indexPath);
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { if (win) showPassive(); });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    await loadStorage(); setupIPC(); createWindow(); createTray();
    const shortcuts = [
      ['CommandOrControl+Shift+Space', toggleVisible], ['CommandOrControl+Alt+I', () => setMode(mode === 'passive' ? 'interactive' : 'passive')],
      ['CommandOrControl+Shift+Q', askClipboard], ['CommandOrControl+Shift+X', toggleClickThrough], ['CommandOrControl+Alt+S', captureAction],
    ];
    for (const [key, action] of shortcuts) { try { if (!globalShortcut.register(key, action)) shortcutsFailed.push(key); } catch { shortcutsFailed.push(key); } }
  }).catch((error) => { console.error('SAA could not start:', error.message); app.quit(); });
}
app.on('before-quit', event => {
  if(quitAfterFlush)return;
  event.preventDefault();if(shutdownPending)return;
  shutdownPending=true;quitting=true;passiveInput?.state(false);
  for(const controller of active.values())controller.abort();
  void(async()=>{
    try{await Promise.allSettled([...activeTasks]);await historyStore?.flush();await Promise.all([...queues.values()]);passiveInput?.close();quitAfterFlush=true;app.quit();}
    catch(error){shutdownPending=false;quitting=false;if(win&&!win.isDestroyed()){showPassive();send('saa:action',{type:'error',text:`SAA stayed open because your data could not be saved: ${error.message}`});}}
  })();
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); tray?.destroy(); });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
