import {
  app,
  clipboard,
  ipcMain,
  Menu,
  net,
  powerMonitor,
  protocol,
  session,
  shell,
} from 'electron';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';
import { readInstallChannel } from './about/about-info.ts';
import { CHROME_PARTITION, createChromeFeature } from './chrome/feature.ts';
import { electronCapture } from './permissions/electron-capture.ts';
import { askMediaWithDialog } from './permissions/media-prompt.ts';
import { startApp } from './start.ts';
import { createSecureOverlay, createSecureWindow } from './windows.ts';

const chrome = createChromeFeature({
  registerSchemesAsPrivileged: (schemes) => {
    protocol.registerSchemesAsPrivileged([...schemes]);
  },
  chromeProtocol: () => session.fromPartition(CHROME_PARTITION).protocol,
  ipc: ipcMain,
  createWindow: (options, renderer) => createSecureWindow(options, renderer),
  setMenu: (template) => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  },
  writeClipboard: (text) => clipboard.writeText(text),
  facts: () => ({
    version: app.getVersion(),
    channel: readInstallChannel(() => readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')),
    versions: process.versions,
    platform: process.platform,
    release: release(),
    arch: process.arch,
  }),
  platform: process.platform,
  rendererRoot: join(import.meta.dirname, '..', 'renderer'),
  preloadPath: join(import.meta.dirname, '..', 'preload', 'chrome.cjs'),
  readFile: (path) => readFile(path),
});

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  createWindow: (options) => createSecureWindow(options),
  createOverlay: (window, renderer) => createSecureOverlay(window, renderer),
  defaultSession: () => session.defaultSession,
  askMedia: askMediaWithDialog,
  capture: electronCapture(process.platform, process.env),
  chrome,
  chromeVersion: process.versions.chrome,
  platform: process.platform,
  env: process.env,
  openExternal: (url) => shell.openExternal(url),
  isOnline: () => net.isOnline(),
  onResume: (listener) => {
    powerMonitor.on('resume', listener);
  },
  warn: (message) => {
    console.warn(message);
  },
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
