import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/plugins.ts';
import { expect, test, whatsAppPage } from './fixtures.ts';

/**
 * Clicks a menu item by its label, wherever it sits in the application menu.
 * The menu is set just before the WhatsApp window opens, so that comes first;
 * startup can take a while on a slow machine.
 */
const clickMenu = async (app: ElectronApplication, label: string) => {
  await whatsAppPage(app);
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
};

/** What the app shows and said, so a missing window explains itself. */
const whatHappened = async (app: ElectronApplication): Promise<string> => {
  const urls = app.windows().map((page) => page.url());
  const said = await app.evaluate(
    () => (globalThis as { pluginMessages?: string[] }).pluginMessages,
  );
  return `windows: ${urls.join(', ')}; messages: ${JSON.stringify(said ?? [])}`;
};

const chromePage = async (app: ElectronApplication, path: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith(path)), {
      message: `a window at ${path}`,
    })
    .toBe(true)
    .catch(async (error: unknown) => {
      throw new Error(`No window at ${path} (${await whatHappened(app)}).`, { cause: error });
    });
  const page = app.windows().find((candidate) => candidate.url().endsWith(path));
  if (page === undefined) {
    throw new Error(`No ${path}.`);
  }
  return page;
};

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

/** A plugin's page, if one runs: its title, whether it shows, and its session. */
const pluginPage = (app: ElectronApplication, id = 'org.example.hello') =>
  app.evaluate(({ BrowserWindow, session, webContents }, home) => {
    const page = webContents.getAllWebContents().find((contents) => contents.getURL() === home);
    if (page === undefined) {
      return null;
    }
    return {
      url: page.getURL(),
      title: page.getTitle(),
      shown: BrowserWindow.fromWebContents(page)?.isVisible() ?? true,
      persistent: page.session.isPersistent(),
      ownSession: page.session !== session.defaultSession,
    };
  }, `plugin://${id}/`);

/** Installs a signed third-party plugin with `main.js`, accepting its consent window. */
async function installPlugin(
  app: ElectronApplication,
  profile: string,
  manifest: Record<string, unknown>,
  main: string,
): Promise<void> {
  const archive = join(profile, `${String(manifest['id'])}.yapyap-plugin`);
  await writeFile(archive, zipArchive(signedArchive(testKey(), manifest, { 'main.js': main })));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  const install = consent.getByRole('button', { name: 'Install' });
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
}

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
