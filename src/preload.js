// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  saveVideo: (data) => ipcRenderer.invoke('video:save', data),
  getVideos: (directory) => ipcRenderer.invoke('video:list', directory),
  renameVideo: (data) => ipcRenderer.invoke('video:rename', data),
});
