const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vanityApi', {
  defaultFolders: () => ipcRenderer.invoke('app:default-folders'),
  chooseFolder: () => ipcRenderer.invoke('dialog:folder'),
  chooseCheckpoint: () => ipcRenderer.invoke('dialog:checkpoint'),
  start: (config) => ipcRenderer.invoke('session:start', config),
  pause: () => ipcRenderer.invoke('session:pause'),
  resume: () => ipcRenderer.invoke('session:resume'),
  stop: () => ipcRenderer.invoke('session:stop'),
  clear: () => ipcRenderer.invoke('session:clear'),
  loadCheckpoint: (checkpointPath) => ipcRenderer.invoke('checkpoint:load', checkpointPath),
  openPath: (targetPath) => ipcRenderer.invoke('open:path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  getPrivateKey: (payload) => ipcRenderer.invoke('private-key:get', payload),
  decryptPrivateKey: (payload) => ipcRenderer.invoke('private-key:decrypt', payload),
  onSessionUpdate: (callback) => ipcRenderer.on('session:update', (_event, value) => callback(value)),
  onSessionStarted: (callback) => ipcRenderer.on('session:started', (_event, value) => callback(value)),
  onHit: (callback) => ipcRenderer.on('session:hit', (_event, value) => callback(value)),
  onCheckpoint: (callback) => ipcRenderer.on('checkpoint:saved', (_event, value) => callback(value)),
  onGpu: (callback) => ipcRenderer.on('gpu:update', (_event, value) => callback(value)),
  onError: (callback) => ipcRenderer.on('session:error', (_event, value) => callback(value)),
});
