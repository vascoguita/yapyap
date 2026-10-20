import {
  app,
  clipboard,
  ipcMain,
  Menu,
  net,
  Notification,
  powerMonitor,
  protocol,
  session,
  shell,
} from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';
import { readInstallChannel } from './about/about-info.ts';
import { CHROME_PARTITION, createChromeFeature } from './chrome/feature.ts';
import { openSettings } from './settings/service.ts';
import { electronCapture } from './permissions/electron-capture.ts';
import { askMediaWithDialog } from './permissions/media-prompt.ts';
import { startApp } from './start.ts';
import { createSecureOverlay, createSecureWindow } from './windows.ts';

const GPU_CRASH_LOG = join(app.getPath('userData'), 'gpu-crashes.json');

const warn = (message: string): void => {
  console.warn(message);
};

const notify = (body: string): void => {
  new Notification({ title: 'YapYap', body }).show();
};

const settings = openSettings(app.getPath('userData'), Date.now(), warn);

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
  notify,
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
  settings,
  restart: () => {
    app.relaunch();
    app.quit();
  },
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
  gpuCrashLog: {
    read: () => readFileSync(GPU_CRASH_LOG, 'utf8'),
    write: (text) => {
      writeFileSync(GPU_CRASH_LOG, text);
    },
  },
  onResume: (listener) => {
    powerMonitor.on('resume', listener);
  },
  settings,
  notify,
  warn,
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
