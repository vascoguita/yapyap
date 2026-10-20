import { app, session, shell } from 'electron';
import { electronCapture } from './permissions/electron-capture.ts';
import { askMediaWithDialog } from './permissions/media-prompt.ts';
import { startApp } from './start.ts';
import { createSecureWindow } from './windows.ts';

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  createWindow: (options) => createSecureWindow(options),
  defaultSession: () => session.defaultSession,
  askMedia: askMediaWithDialog,
  capture: electronCapture(process.platform, process.env),
  env: process.env,
  openExternal: (url) => shell.openExternal(url),
  warn: (message) => {
    console.warn(message);
  },
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
