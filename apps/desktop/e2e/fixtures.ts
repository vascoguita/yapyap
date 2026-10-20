import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';
import { appEnvironment } from './app-environment.ts';
import { startFakeWhatsApp, type FakeWhatsApp } from './fake-whatsapp-server.ts';

export const MAIN = join(import.meta.dirname, '..', 'out', 'main', 'index.js');

interface Options {
  /** The fake WhatsApp page served at `/`. */
  fakePage: string;
}

interface Fixtures {
  fakeWhatsApp: FakeWhatsApp;
  app: ElectronApplication;
  window: Page;
}

export const test = base.extend<Fixtures & Options>({
  fakePage: ['index.html', { option: true }],
  fakeWhatsApp: async ({ fakePage }, use) => {
    const server = await startFakeWhatsApp(fakePage);
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
