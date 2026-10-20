import { contextBridge, ipcRenderer } from 'electron';
import { createChromeBridge } from './bridge.ts';

contextBridge.exposeInMainWorld(
  'yapyap',
  createChromeBridge((channel) => ipcRenderer.invoke(channel)),
);
