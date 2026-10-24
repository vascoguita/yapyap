import { ipcRenderer } from 'electron';
import { forwardPort, type PortTarget } from './forward.ts';

// A plugin page's global scope is its window.
forwardPort(ipcRenderer, globalThis as unknown as PortTarget);
