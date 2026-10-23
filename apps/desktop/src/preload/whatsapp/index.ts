import { contextBridge, ipcRenderer } from 'electron';
import { NOTIFICATION_BRIDGE } from '../../shared/notification-api.ts';
import { createNotificationBridge } from './bridge.ts';
import { installNotificationShim } from './notification-shim.ts';

contextBridge.exposeInMainWorld(NOTIFICATION_BRIDGE, createNotificationBridge(ipcRenderer));
// Before any page script runs, so WhatsApp only ever sees the stand-in.
contextBridge.executeInMainWorld({ func: installNotificationShim, args: [NOTIFICATION_BRIDGE] });
