import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/plugins.ts';
import { expect, test } from './fixtures.ts';
import { chromePage, clickMenu, installPlugin, pluginPage } from './plugin-helpers.ts';

test('installs a third-party plugin only once the user accepts the risk, and marks it', async ({
  app,
  profile,
}) => {
  // Signed with a key made for this run and kept in memory (ADR 0005).
  const archive = join(profile, 'hello.yapyap-plugin');
  await writeFile(archive, zipArchive(signedArchive(testKey())));
  await app.evaluate(({ dialog }, path) => {
    const messages: string[] = [];
    Object.assign(globalThis, { pluginMessages: messages });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = (options: unknown) => {
      messages.push((options as { message: string }).message);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await expect(consent.getByRole('heading', { name: 'Install Hello?' })).toBeVisible();
  await expect(consent.getByText(/you install it at your own risk/)).toBeVisible();
  const install = consent.getByRole('button', { name: 'Install' });
  await expect(install).toBeDisabled();
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  // Install closes the window, which can end the click before Playwright sees it
  // finish; the poll below checks that it installed.
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { pluginMessages: string[] }).pluginMessages),
    )
    .toEqual(['Hello 1.0.0 is installed.']);
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await expect(plugins.getByText('org.example.hello')).toBeVisible();
  await expect(plugins.getByText('Third-party')).toBeVisible();
});

/** What the plugin's script found it could and could not do, as it wrote in its title. */
const PROBE = `
const tried = [];
try { eval('1'); tried.push('eval'); } catch { tried.push('no-eval'); }
try { await fetch('https://example.com/'); tried.push('online'); } catch { tried.push('offline'); }
tried.push(window.open('https://example.com/') === null ? 'no-popup' : 'popup');
document.title = tried.join(' ');
export {};
`;

test('runs an installed plugin hidden, on its own session, with no eval and no network', async ({
  app,
  profile,
}) => {
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: [], network: { hosts: [] } }),
    PROBE,
  );
  await expect
    .poll(() => pluginPage(app), { timeout: 20_000 })
    .toEqual({
      url: 'plugin://org.example.hello/',
      title: 'no-eval offline no-popup',
      shown: false,
      persistent: false,
      ownSession: true,
    });
  // Its window stays hidden: nothing a plugin does can show it.
  expect((await pluginPage(app))?.shown).toBe(false);
  // Its fetch to a host it never declared made YapYap ask, and the user said no.
  expect(
    await app.evaluate(() => (globalThis as { pluginPrompts?: string[] }).pluginPrompts),
  ).toContain('Let Hello connect to example.com?');
});

/** Shows a notification, then writes in its title how that went. */
const NOTIFIER = `
export default {
  async activate(host) {
    try {
      await host.notifications.show({ title: 'Done', body: 'Your draft is ready.' });
      document.title = 'ok';
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('answers a plugin’s calls over its port, only for what it was granted', async ({
  app,
  profile,
}) => {
  await app.evaluate(({ Notification }) => {
    const shown: string[] = [];
    Object.assign(globalThis, { pluginNotifications: shown });
    Notification.prototype.show = function show(this: Electron.Notification) {
      shown.push(`${this.title} / ${this.body}`);
    };
  });
  const network = { hosts: [] };
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['notifications:show'], network }),
    NOTIFIER,
  );
  await expect.poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 }).toBe('ok');
  const quiet = testManifest({ id: 'org.example.quiet', name: 'Quiet', capabilities: [], network });
  await installPlugin(app, profile, quiet, NOTIFIER);
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.quiet'))?.title, { timeout: 20_000 })
    .toBe('not-granted');
  expect(
    await app.evaluate(
      () => (globalThis as { pluginNotifications?: string[] }).pluginNotifications,
    ),
  ).toEqual(['Hello: Done / Your draft is ready.']);
  // The Plugins window shows both calls and how each went, never what they carried.
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  const activity = plugins.getByRole('region', { name: 'Recent activity' });
  await expect(activity.getByRole('listitem')).toHaveCount(2);
  await expect(activity.getByRole('listitem').first()).toContainText('org.example.quiet');
  await expect(activity.getByRole('listitem').first()).toContainText('Refused: not allowed');
  await expect(activity.getByRole('listitem').last()).toContainText('Show notificationsDone');
  await expect(activity).not.toContainText('Your draft is ready.');
});

/** Keeps a secret and reads it back, or only reads it, and writes what it got in its title. */
const keeper = (store: boolean) => `
export default {
  async activate(host) {
    try {
      ${store ? "await host.secrets.set('apiKey', 'sk-test');" : ''}
      document.title = String(await host.secrets.get('apiKey'));
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('keeps each plugin’s secrets to itself', async ({ app, profile }) => {
  // The test system has no keyring, so encryption is stood in for, reversibly.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
  });
  const network = { hosts: [] };
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['secrets:own'], network }),
    keeper(true),
  );
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
    .toBe('sk-test');
  const other = testManifest({
    id: 'org.example.other',
    name: 'Other',
    capabilities: ['secrets:own'],
    network,
  });
  await installPlugin(app, profile, other, keeper(false));
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.other'))?.title, { timeout: 20_000 })
    .toBe('undefined');
  // What the file keeps is what the system's encryption made of the secret.
  const kept = await readFile(join(profile, 'plugins', '.secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-test');
});

/** Drafts a reply, then writes in its title how that went. */
const DRAFTER = `
export default {
  async activate(host) {
    try {
      await host.composer.insertDraft('Sounds good, see you at 8.');
      document.title = 'drafted';
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('puts a plugin’s draft in the open chat’s message box, for the user to send', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['composer:insert-draft'], network: { hosts: [] } }),
    DRAFTER,
  );
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
    .toBe('drafted');
  await expect(window.getByTestId('composer')).toHaveText('Sounds good, see you at 8.');
});
