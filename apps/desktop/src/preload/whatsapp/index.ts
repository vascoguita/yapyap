import { contextBridge, ipcRenderer } from 'electron';
import { NOTIFICATION_BRIDGE } from '../../shared/notification-api.ts';
import { SHARE_BRIDGE } from '../../shared/share-api.ts';
import { createNotificationBridge, createShareBridge } from './bridge.ts';
import { installNotificationShim } from './notification-shim.ts';
import { installShareShim } from './share-shim.ts';

contextBridge.exposeInMainWorld(NOTIFICATION_BRIDGE, createNotificationBridge(ipcRenderer));
contextBridge.exposeInMainWorld(SHARE_BRIDGE, createShareBridge(ipcRenderer));
// Before any page script runs, so WhatsApp only ever sees the stand-ins.
contextBridge.executeInMainWorld({ func: installNotificationShim, args: [NOTIFICATION_BRIDGE] });
contextBridge.executeInMainWorld({ func: installShareShim, args: [SHARE_BRIDGE] });
