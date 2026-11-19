// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ai: (action, data) => {
    const allowed = ['settings', 'configure', 'forget-key', 'test', 'library', 'open', 'relink', 'cancel', 'analyze', 'save', 'export', 'frame'];
    if (!allowed.includes(action)) return Promise.reject(new Error('Unknown AI action'));
    return ipcRenderer.invoke(`ai:${action}`, data);
  },
  onAIProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('ai:progress', listener);
    return () => ipcRenderer.removeListener('ai:progress', listener);
  },
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  saveVideo: (data) => ipcRenderer.invoke('video:save', data),
  getVideos: (directory) => ipcRenderer.invoke('video:list', directory),
  renameVideo: (data) => ipcRenderer.invoke('video:rename', data),
  deleteVideo: (data) => ipcRenderer.invoke('video:delete', data),
});
