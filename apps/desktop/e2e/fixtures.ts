import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';
import { startFakeWhatsApp, type FakeWhatsApp } from './fake-whatsapp-server.ts';

const MAIN = join(import.meta.dirname, '..', 'out', 'main', 'index.js');

// Editors built on Electron (such as VS Code) export ELECTRON_RUN_AS_NODE to
// their terminals, which would make the app start as plain Node.js.
function appEnvironment(origin: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  return { ...env, YAPYAP_TEST_WHATSAPP_ORIGIN: origin };
}

interface Fixtures {
  fakeWhatsApp: FakeWhatsApp;
  app: ElectronApplication;
  window: Page;
}

export const test = base.extend<Fixtures>({
  fakeWhatsApp: async ({}, use) => {
    const server = await startFakeWhatsApp();
    await use(server);
    await server.close();
  },
  app: async ({ fakeWhatsApp }, use) => {
    const app = await electron.launch({
      args: [MAIN],
      env: appEnvironment(fakeWhatsApp.origin),
    });
    await use(app);
    await app.close();
  },
  window: async ({ app }, use) => {
    await use(await app.firstWindow());
  },
});

export { expect } from '@playwright/test';
