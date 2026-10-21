import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  protocol,
  screen,
  session,
  shell,
  type WebContents,
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
import { sandboxDisabled } from './sandbox-check.ts';
import { confirmResetWithDialog } from './session-reset-prompt.ts';
import { explainUnsafeStartWithDialog } from './unsafe-start-prompt.ts';
import { startApp } from './start.ts';
import { createSecureOverlay, createSecureWindow } from './windows.ts';

const PICKER_THUMBNAIL = { width: 320, height: 180 };

const GPU_CRASH_LOG = join(app.getPath('userData'), 'gpu-crashes.json');
const WINDOW_STATE = join(app.getPath('userData'), 'window-state.json');

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
  confirmReset: confirmResetWithDialog,
  captureSources: () =>
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: PICKER_THUMBNAIL }),
  // The picker's owner is a web contents Electron itself handed to the capture handler.
  windowOf: (contents) => BrowserWindow.fromWebContents(contents as WebContents),
});

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  createWindow: (options) => createSecureWindow(options),
  createOverlay: (window, renderer) => createSecureOverlay(window, renderer),
  defaultSession: () => session.defaultSession,
  askMedia: askMediaWithDialog,
  capture: (pickInApp) =>
    electronCapture(process.platform, process.env, process.getSystemVersion(), pickInApp),
  chrome,
  chromeVersion: process.versions.chrome,
  platform: process.platform,
  env: process.env,
  argv: process.argv,
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
  nativeTheme,
  windowState: {
    read: () => readFileSync(WINDOW_STATE, 'utf8'),
    write: (text) => {
      writeFileSync(WINDOW_STATE, text);
    },
  },
  workAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  shutdown: {
    onSignal: (signal, listener) => {
      process.on(signal, listener);
    },
    onSystemShutdown: (listener) => {
      powerMonitor.on('shutdown', listener);
    },
  },
  sandboxDisabled: sandboxDisabled(app.commandLine, process.env),
  explainUnsafeStart: explainUnsafeStartWithDialog,
  notify,
  warn,
  logError: (message) => {
    console.error(message);
  },
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
