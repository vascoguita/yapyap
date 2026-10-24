import { writeFile } from 'node:fs/promises';
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

/** The plugin's page, if one runs: its title, whether it shows, and its session. */
const pluginPage = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, session, webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('plugin://'));
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
  });

test('runs an installed plugin hidden, on its own session, with no eval and no network', async ({
  app,
  profile,
}) => {
  const archive = join(profile, 'probe.yapyap-plugin');
  const manifest = testManifest({ capabilities: [], network: { hosts: [] } });
  await writeFile(archive, zipArchive(signedArchive(testKey(), manifest, { 'main.js': PROBE })));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  const install = consent.getByRole('button', { name: 'Install' });
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
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
