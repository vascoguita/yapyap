import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { signedArchive, testKey, zipArchive } from '../test/plugins.ts';
import { expect, whatsAppPage } from './fixtures.ts';

/**
 * Clicks a menu item by its label, wherever it sits in the application menu.
 * The menu is set just before the WhatsApp window opens, so that comes first;
 * startup can take a while on a slow machine.
 */
export const clickMenu = async (app: ElectronApplication, label: string): Promise<void> => {
  await whatsAppPage(app);
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
};

/**
 * Clicks a plugin command in the "Plugin Commands" menu, once the plugin has
 * started and its commands are listed; returns whether it was there.
 */
export const runPluginCommand = (app: ElectronApplication, label: string): Promise<boolean> =>
  app.evaluate(({ Menu }, wanted) => {
    const commands = Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Plugin Commands');
    const command = commands?.submenu?.items.find((entry) => entry.label === wanted);
    command?.click();
    return command !== undefined;
  }, label);

/** What the app shows and said, so a missing window explains itself. */
const whatHappened = async (app: ElectronApplication): Promise<string> => {
  const urls = app.windows().map((page) => page.url());
  const said = await app.evaluate(
    () => (globalThis as { pluginMessages?: string[] }).pluginMessages,
  );
  return `windows: ${urls.join(', ')}; messages: ${JSON.stringify(said ?? [])}`;
};

export const chromePage = async (app: ElectronApplication, path: string): Promise<Page> => {
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

/** A plugin's page, if one runs: its title, whether it shows, and its session. */
/** What the E2E tests read of a plugin's page. */
export interface PluginPage {
  readonly url: string;
  readonly title: string;
  readonly shown: boolean;
  readonly persistent: boolean;
  readonly ownSession: boolean;
}

export const pluginPage = (
  app: ElectronApplication,
  id = 'org.example.hello',
): Promise<PluginPage | null> =>
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
export async function installPlugin(
  app: ElectronApplication,
  profile: string,
  manifest: Record<string, unknown>,
  main: string,
): Promise<void> {
  const archive = join(profile, `${String(manifest['id'])}.yapyap-plugin`);
  await writeFile(archive, zipArchive(signedArchive(testKey(), manifest, { 'main.js': main })));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    const asked: string[] = [];
    Object.assign(globalThis, { pluginPrompts: asked });
    // The second button denies: a plugin's request for a new host is refused, and only recorded.
    dialog.showMessageBox = (options: unknown) => {
      asked.push((options as { message: string }).message);
      return Promise.resolve({ response: 1, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  const install = consent.getByRole('button', { name: 'Install' });
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
}
