// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  getSpeechModelStatus: () => ipcRenderer.invoke('speech-model:status'),
  ensureSpeechModel: () => ipcRenderer.invoke('speech-model:ensure'),
  onSpeechModelProgress: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('speech-model:progress', listener);
    return () => ipcRenderer.removeListener('speech-model:progress', listener);
  },
  saveVideo: (data) => ipcRenderer.invoke('video:save', data),
  getVideos: (directory) => ipcRenderer.invoke('video:list', directory),
  renameVideo: (data) => ipcRenderer.invoke('video:rename', data),
  deleteVideo: (data) => ipcRenderer.invoke('video:delete', data),
});
