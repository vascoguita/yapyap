import type { ElectronApplication } from '@playwright/test';
import { testManifest } from '../test/plugins.ts';
import { expect, test } from './fixtures.ts';
import { installPlugin, pluginPage } from './plugin-helpers.ts';

/**
 * A plugin that tries everything ADR 0004 says a plugin cannot do, and
 * writes what happened as JSON in its title for the test to read.
 */
const HOSTILE = `
let stolen;
// It listens for YapYap's port as the bootstrap does, hoping to use it directly.
const portArrived = new Promise((resolve) => {
  addEventListener('message', (event) => {
    if (event.ports[0] !== undefined) {
      stolen ??= event.ports[0];
      resolve();
    }
  });
});
const attempt = async (work) => {
  try {
    return await work();
  } catch (error) {
    return error?.kind ?? 'blocked';
  }
};
const viaStolenPort = (method, params) =>
  new Promise((resolve) => {
    if (stolen === undefined) {
      resolve('no-port');
      return;
    }
    stolen.addEventListener('message', ({ data }) => resolve(data.error?.kind ?? 'answered'));
    stolen.start();
    stolen.postMessage({ id: 999_999, method, params });
  });
export default {
  async activate(host) {
    await Promise.race([portArrived, new Promise((resolve) => setTimeout(resolve, 5000))]);
    const report = {
      reachesWhatsApp: window.opener !== null || window.parent !== window || window.length > 0,
      whatsAppOrigin: await attempt(() => fetch(${JSON.stringify('__WHATSAPP__')}).then(() => 'reached')),
      undeclaredHost: await attempt(() => fetch('https://example.com/').then(() => 'reached')),
      webSocket: await attempt(
        () =>
          new Promise((resolve, reject) => {
            const socket = new WebSocket('wss://example.com/');
            socket.onopen = () => resolve('reached');
            socket.onerror = () => reject(new Error('closed'));
          }),
      ),
      otherSecret: await attempt(() => host.secrets.get('../org.example.victim/apiKey')),
      ownSecret: String(await attempt(() => host.secrets.get('apiKey'))),
      otherStorage: String(localStorage.getItem('victim')),
      sendApi: 'send' in host.composer || 'messages' in host,
      sendViaPort: await viaStolenPort('messages.send', ['+44 7700 900123', 'hello']),
      popup: window.open('plugin://org.example.hostile/') === null ? 'blocked' : 'opened',
      flood: (
        await Promise.all(
          Array.from({ length: 40 }, () =>
            attempt(() => host.notifications.show({ title: 'Spam', body: '' })),
          ),
        )
      ).includes('rate-limited'),
    };
    document.title = JSON.stringify(report);
  },
};
`;

/** Keeps a secret and some local storage of its own, as a plugin the hostile one wants to rob. */
const VICTIM = `
export default {
  async activate(host) {
    localStorage.setItem('victim', 'private');
    await host.secrets.set('apiKey', 'sk-victim');
    document.title = 'ready';
  },
};
`;

/** Keeps its renderer busy for good, as a plugin stuck in a loop would. */
const SPINNER = `
export default {
  activate() {
    setTimeout(() => {
      for (;;) {}
    });
  },
};
`;

/** The plugin page's renderer, which a restart replaces. */
const rendererOf = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ webContents }, home) =>
      webContents.getAllWebContents().find((page) => page.getURL() === home)?.id ?? null,
    `plugin://${id}/`,
  );

test('a hostile plugin cannot reach WhatsApp, other plugins, the network or the user', async ({
  app,
  profile,
  fakeWhatsApp,
}) => {
  // The test system has no keyring, so encryption is stood in for, reversibly.
  await app.evaluate(({ safeStorage, Notification }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
    Notification.prototype.show = () => undefined;
  });
  const network = { hosts: [] };
  const victim = testManifest({
    id: 'org.example.victim',
    name: 'Victim',
    capabilities: ['secrets:own'],
    network,
  });
  await installPlugin(app, profile, victim, VICTIM);
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.victim'))?.title, { timeout: 20_000 })
    .toBe('ready');
  const hostile = testManifest({
    id: 'org.example.hostile',
    name: 'Hostile',
    capabilities: ['secrets:own', 'notifications:show'],
    network,
  });
  await installPlugin(
    app,
    profile,
    hostile,
    HOSTILE.replace('__WHATSAPP__', `${fakeWhatsApp.origin}/`),
  );
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.hostile'))?.title, { timeout: 30_000 })
    .toMatch(/^\{/);
  const report = JSON.parse(
    (await pluginPage(app, 'org.example.hostile'))?.title ?? '{}',
  ) as Record<string, unknown>;
  // YapYap hands its port over before a plugin's own code has loaded, so the plugin usually
  // never gets hold of it; if it ever does, there is still no operation that sends.
  expect(report).toEqual({
    reachesWhatsApp: false,
    whatsAppOrigin: 'blocked',
    undeclaredHost: 'blocked',
    webSocket: 'blocked',
    otherSecret: 'invalid',
    ownSecret: 'undefined',
    otherStorage: 'null',
    sendApi: false,
    sendViaPort: expect.stringMatching(/^(?:no-port|invalid)$/),
    popup: 'blocked',
    flood: true,
  });
  // Its window never shows, so nothing it draws can pass for WhatsApp or YapYap.
  expect((await pluginPage(app, 'org.example.hostile'))?.shown).toBe(false);
});

test('a plugin that keeps the processor busy is restarted', async ({ app, profile }) => {
  await installPlugin(
    app,
    profile,
    testManifest({
      id: 'org.example.spinner',
      name: 'Spinner',
      capabilities: [],
      network: { hosts: [] },
    }),
    SPINNER,
  );
  await expect
    .poll(() => rendererOf(app, 'org.example.spinner'), { timeout: 20_000 })
    .not.toBeNull();
  const first = await rendererOf(app, 'org.example.spinner');
  // Three samples five seconds apart over the limit, then a new renderer.
  await expect
    .poll(() => rendererOf(app, 'org.example.spinner'), { timeout: 45_000, intervals: [1000] })
    .not.toBe(first);
  expect(await rendererOf(app, 'org.example.spinner')).not.toBeNull();
});
