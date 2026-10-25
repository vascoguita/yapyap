import { contextBridge, ipcRenderer } from 'electron';
import {
  PLUGINS_CHANGED_EVENT,
  SIDEBAR_STATE_EVENT,
  type SidebarState,
} from '../../shared/chrome-api.ts';
import { createChromeBridge } from './bridge.ts';

contextBridge.exposeInMainWorld(
  'yapyap',
  createChromeBridge(
    (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    // The page gets the state alone, never the IPC event.
    (listener) => {
      ipcRenderer.on(SIDEBAR_STATE_EVENT, (_event, state: SidebarState) => {
        listener(state);
      });
    },
    (listener) => {
      ipcRenderer.on(PLUGINS_CHANGED_EVENT, () => {
        listener();
      });
    },
  ),
);
