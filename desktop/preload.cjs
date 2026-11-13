'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  if (typeof callback !== 'function') throw new TypeError('Expected a callback.');
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('saa', Object.freeze({
  load: () => ipcRenderer.invoke('saa:load'),
  saveWorkspace:patch=>ipcRenderer.invoke('saa:saveWorkspace',patch),
  assistantState:()=>ipcRenderer.invoke('saa:assistantState'),
  assistantPick:()=>ipcRenderer.invoke('saa:assistantPick'),
  assistantRun:request=>ipcRenderer.invoke('saa:assistantRun',request),
  assistantCancel:()=>ipcRenderer.invoke('saa:assistantCancel'),
  assistantRemove:id=>ipcRenderer.invoke('saa:assistantRemove',id),
  assistantPreview:id=>ipcRenderer.invoke('saa:assistantPreview',id),
  assistantExport:id=>ipcRenderer.invoke('saa:assistantExport',id),
  assistantOpenTask:id=>ipcRenderer.invoke('saa:assistantOpenTask',id),
  assistantDeleteTask:id=>ipcRenderer.invoke('saa:assistantDeleteTask',id),
  onAssistant:callback=>subscribe('saa:assistant',callback),
  permissions: (action) => ipcRenderer.invoke('saa:permissions',action),
  saveSettings: (settings) => ipcRenderer.invoke('saa:saveSettings', settings),
  selectProvider: (id) => ipcRenderer.invoke('saa:selectProvider',id),
  saveProvider: (id,patch) => ipcRenderer.invoke('saa:saveProvider',id,patch),
  validateProvider: (id,patch) => ipcRenderer.invoke('saa:validateProvider',id,patch),
  saveAppearance: (appearance) => ipcRenderer.invoke('saa:saveAppearance', appearance),
  savePrivacy: (value) => ipcRenderer.invoke('saa:savePrivacy',value),
  saveConversations: (conversations) => ipcRenderer.invoke('saa:saveConversations', conversations),
  startChat: (request) => ipcRenderer.invoke('saa:startChat', request),
  cancelChat: (id) => ipcRenderer.invoke('saa:cancelChat', id),
  onChat: (callback) => subscribe('saa:chat', callback),
  windowAction: (action) => ipcRenderer.invoke('saa:windowAction', action),
  clipboard: () => ipcRenderer.invoke('saa:clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('saa:writeClipboard', text),
  capture: () => ipcRenderer.invoke('saa:capture'),
  onAction: (callback) => subscribe('saa:action', callback),
  onPassiveInput:(callback)=>subscribe('saa:passiveInput',callback),
  passiveControl:(action)=>ipcRenderer.invoke('saa:passiveControl',action),
}));
