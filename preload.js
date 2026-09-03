const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radar', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  run: (s) => ipcRenderer.invoke('run', s),
  open: (url) => ipcRenderer.invoke('open', url),
  dataDir: () => ipcRenderer.invoke('datadir'),
  exportCsv: (results) => ipcRenderer.invoke('export:csv', results),
  exportSheet: (settings, results) => ipcRenderer.invoke('export:sheet', settings, results),
  pickKey: () => ipcRenderer.invoke('pick:key'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  listModels: (s) => ipcRenderer.invoke('models', s),
  suggestSources: (s) => ipcRenderer.invoke('suggest:sources', s),
  checkUpdate: (r) => ipcRenderer.invoke('update:check', r),
  version: () => ipcRenderer.invoke('version'),
  team: () => ipcRenderer.invoke('team'),
  onSuggestLog: (cb) => ipcRenderer.on('suggest:log', (_e, m) => cb(m)),
  onLog: (cb) => ipcRenderer.on('run:log', (_e, msg) => cb(msg))
});
