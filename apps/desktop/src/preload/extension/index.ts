import { ipcRenderer } from 'electron';
import { forwardPort, type PortTarget } from './forward.ts';

// An extension page's global scope is its window.
forwardPort(ipcRenderer, globalThis as unknown as PortTarget);
