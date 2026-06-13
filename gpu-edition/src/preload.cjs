const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vanityClean', {
  systemInfo: () => ipcRenderer.invoke('system:info'),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openFolder: (folder) => ipcRenderer.invoke('folder:open', folder),
  start: (config) => ipcRenderer.invoke('scan:start', config),
  stop: () => ipcRenderer.invoke('scan:stop'),
  onUpdate: (callback) => ipcRenderer.on('scan:update', (_event, value) => callback(value)),
  onHit: (callback) => ipcRenderer.on('scan:hit', (_event, value) => callback(value)),
  onError: (callback) => ipcRenderer.on('scan:error', (_event, value) => callback(value)),
});
