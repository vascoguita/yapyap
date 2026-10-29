import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from '@playwright/test';
import { signedArchive, testKey, zipArchive } from '../test/extensions.ts';
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
 * Clicks an extension command in the "Extension Commands" menu, once the extension has
 * started and its commands are listed; returns whether it was there.
 */
export const runExtensionCommand = (app: ElectronApplication, label: string): Promise<boolean> =>
  app.evaluate(({ Menu }, wanted) => {
    const commands = Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Extension Commands');
    const command = commands?.submenu?.items.find((entry) => entry.label === wanted);
    command?.click();
    return command !== undefined;
  }, label);

/** What the app shows and said, so a missing window explains itself. */
const whatHappened = async (app: ElectronApplication): Promise<string> => {
  const urls = app.windows().map((page) => page.url());
  const said = await app.evaluate(
    () => (globalThis as { extensionMessages?: string[] }).extensionMessages,
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

/** An extension's page, if one runs: its title, whether it shows, and its session. */
/** What the E2E tests read of an extension's page. */
export interface ExtensionPage {
  readonly url: string;
  readonly title: string;
  readonly shown: boolean;
  readonly persistent: boolean;
  readonly ownSession: boolean;
}

export const extensionPage = (
  app: ElectronApplication,
  id = 'org.example.hello',
): Promise<ExtensionPage | null> =>
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
  }, `extension://${id}/`);

/** Installs a signed third-party extension with `main.js` and `files`, accepting its consent window. */
export async function installExtension(
  app: ElectronApplication,
  profile: string,
  manifest: Record<string, unknown>,
  main: string,
  files: Readonly<Record<string, string>> = {},
): Promise<void> {
  const archive = join(profile, `${String(manifest['id'])}.yapyap-extension`);
  const signed = signedArchive(testKey(), manifest, { 'main.js': main, ...files });
  await writeFile(archive, zipArchive(signed));
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    const asked: string[] = [];
    Object.assign(globalThis, { extensionPrompts: asked });
    // The second button denies: an extension's request for a new host is refused, and only recorded.
    dialog.showMessageBox = (options: unknown) => {
      asked.push((options as { message: string }).message);
      return Promise.resolve({ response: 1, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Extension…');
  const consent = await chromePage(app, '/extension-consent.html');
  await consent.getByLabel('I understand that I install this extension at my own risk').check();
  const install = consent.getByRole('button', { name: 'Install' });
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
}

/** A built extension's manifest, its `main.js` and its other files. */
export interface BuiltExtension {
  readonly manifest: Record<string, unknown>;
  readonly main: string;
  readonly others: Readonly<Record<string, string>>;
}

/**
 * A first-party extension as `pnpm build` bundles it, under a third-party `id`:
 * only YapYap's own key may sign its real one.
 */
export async function builtExtension(folder: string, id: string): Promise<BuiltExtension> {
  const dist = fileURLToPath(new URL(`../../../extensions/${folder}/dist/`, import.meta.url));
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const names = (await readdir(dist)).filter((name) => name.endsWith('.js'));
  const files = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(join(dist, name), 'utf8')] as const),
    ),
  );
  const { 'main.js': main = '', ...others } = files;
  return { manifest: { ...manifest, id }, main, others };
}
