import { app } from 'electron';
import { startApp } from './start.ts';
import { createSecureWindow } from './windows.ts';

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  createWindow: (options) => createSecureWindow(options),
  env: process.env,
  warn: (message) => {
    console.warn(message);
  },
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
