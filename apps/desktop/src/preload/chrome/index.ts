import { contextBridge, ipcRenderer } from 'electron';
import { createChromeBridge } from './bridge.ts';

contextBridge.exposeInMainWorld(
  'yapyap',
  createChromeBridge(
    (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    // The page gets the payload alone, never the IPC event.
    (event, listener) => {
      ipcRenderer.on(event, (_event, payload: unknown) => {
        listener(payload as Parameters<typeof listener>[0]);
      });
    },
  ),
);
