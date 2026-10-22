import { contextBridge, ipcRenderer } from 'electron';
import type { TextApi } from '../shared/ipc';

const api: TextApi = {
  // Inlined: a sandboxed preload can require electron, but not a generated sibling chunk.
  submit: (text) => ipcRenderer.invoke('text:submit', text),
  startPoll: (poll) => ipcRenderer.invoke('text:poll', poll),
  cancel: () => ipcRenderer.send('text:cancel'),
  strings: () => ipcRenderer.invoke('text:strings'),
};

contextBridge.exposeInMainWorld('textApi', api);
