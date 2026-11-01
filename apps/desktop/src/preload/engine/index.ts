import { contextBridge, ipcRenderer } from 'electron';
import { ENGINE_BRIDGE } from '../../shared/engine-api.ts';
import { createEngineBridge } from './bridge.ts';

contextBridge.exposeInMainWorld(ENGINE_BRIDGE, createEngineBridge(ipcRenderer));
