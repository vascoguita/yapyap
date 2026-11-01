import type { ElectronApplication } from '@playwright/test';
import { RPC_OPTIONS } from '../src/main/extensions/rpc.ts';
import { testManifest } from '../test/extensions.ts';
import { expect, test } from './fixtures.ts';
import {
  EXTENSION_START_TIMEOUT,
  extensionPage,
  extensionTitle,
  installExtension,
} from './extension-helpers.ts';

/**
 * Well past the burst, since the bucket refills while the calls arrive: a
 * flood of exactly the burst passed on a slow runner.
 */
const FLOOD = RPC_OPTIONS.rate.burst * 3;

/**
 * An extension that tries everything ADR 0004 says an extension cannot do, and
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
    // The bootstrap may take YapYap's port before this listener sees it, so
    // the port may never come; the bound reports that as 'no-port', not a hang.
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
      popup: window.open('extension://org.example.hostile/') === null ? 'blocked' : 'opened',
      flood: (
        await Promise.all(
          Array.from({ length: ${String(FLOOD)} }, () =>
            attempt(() => host.notifications.show({ title: 'Spam', body: '' })),
          ),
        )
      ).includes('rate-limited'),
    };
    document.title = JSON.stringify(report);
  },
};
`;

/** Keeps a secret and some local storage of its own, as an extension the hostile one wants to rob. */
const VICTIM = `
export default {
  async activate(host) {
    localStorage.setItem('victim', 'private');
    await host.secrets.set('apiKey', 'sk-victim');
    document.title = 'ready';
  },
};
`;

/** Keeps its renderer busy for good, as an extension stuck in a loop would. */
const SPINNER = `
export default {
  activate() {
    setTimeout(() => {
      for (;;) {}
    });
  },
};
`;

/** The extension page's renderer, which a restart replaces. */
const rendererOf = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ webContents }, home) =>
      webContents.getAllWebContents().find((page) => page.getURL() === home)?.id ?? null,
    `extension://${id}/`,
  );

test('a hostile extension cannot reach WhatsApp, other extensions, the network or the user', async ({
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
  await installExtension(app, profile, victim, VICTIM);
  await expect
    .poll(() => extensionTitle(app, 'org.example.victim'), { timeout: EXTENSION_START_TIMEOUT })
    .toBe('ready');
  const hostile = testManifest({
    id: 'org.example.hostile',
    name: 'Hostile',
    capabilities: ['secrets:own', 'notifications:show'],
    network,
  });
  await installExtension(
    app,
    profile,
    hostile,
    HOSTILE.replace('__WHATSAPP__', `${fakeWhatsApp.origin}/`),
  );
  await expect
    .poll(() => extensionTitle(app, 'org.example.hostile'), { timeout: 30_000 })
    .toMatch(/^\{/);
  const report = JSON.parse((await extensionTitle(app, 'org.example.hostile')) ?? '{}') as Record<
    string,
    unknown
  >;
  // YapYap hands its port over before an extension's own code has loaded, so the extension usually
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
  expect((await extensionPage(app, 'org.example.hostile'))?.shown).toBe(false);
});

test('an extension that keeps the processor busy is restarted', async ({ app, profile }) => {
  await installExtension(
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
    .poll(() => rendererOf(app, 'org.example.spinner'), { timeout: EXTENSION_START_TIMEOUT })
    .not.toBeNull();
  const first = await rendererOf(app, 'org.example.spinner');
  // Three samples five seconds apart over the limit, then a new renderer. A
  // restart passes through a moment with none, which is not yet the new one.
  const restarted = async () => {
    const now = await rendererOf(app, 'org.example.spinner');
    return now !== null && now !== first;
  };
  await expect.poll(restarted, { timeout: 45_000, intervals: [1000] }).toBe(true);
});
