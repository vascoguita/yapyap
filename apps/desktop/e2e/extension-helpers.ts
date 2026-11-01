import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Page } from '@playwright/test';
import { signedArchive, testKey, zipArchive, type TestFiles } from '../test/extensions.ts';
import { expect, whatsAppContents, whatsAppPage } from './fixtures.ts';

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

/**
 * How many bytes of sound the recording in progress has written to its
 * `.part` file in `folder`, so a test can wait for sound rather than a while.
 */
export const recordedBytes = async (folder: string): Promise<number> => {
  const names = await readdir(folder).catch(() => []);
  const sizes = await Promise.all(
    names
      .filter((name) => name.endsWith('.part'))
      .map(async (name) => (await stat(join(folder, name))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
};

/** An extension's page, if one runs: its title, whether it shows, and its session. */
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

/**
 * How long a test waits for an installed extension to start and report
 * through its title: its renderer starts cold, which a slow runner can take
 * well over an expectation's default timeout to do.
 */
export const EXTENSION_START_TIMEOUT = 20_000;

/**
 * The title of an extension's page, where test extensions write how things
 * went, or undefined while it does not run.
 */
export const extensionTitle = async (
  app: ElectronApplication,
  id?: string,
): Promise<string | undefined> => (await extensionPage(app, id))?.title;

/**
 * Installs a signed third-party extension with `main.js` and `files`,
 * accepting its consent window. Prompts it raises later are denied, but
 * for those whose message is in `allow`.
 */
export async function installExtension(
  app: ElectronApplication,
  profile: string,
  manifest: Record<string, unknown>,
  main: string,
  files: TestFiles = {},
  allow: string | readonly string[] = [],
): Promise<void> {
  const archive = join(profile, `${String(manifest['id'])}.yapyap-extension`);
  const signed = signedArchive(testKey(), manifest, { 'main.js': main, ...files });
  await writeFile(archive, zipArchive(signed));
  await app.evaluate(
    ({ dialog }, { path, allowed }) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
      const asked: string[] = [];
      Object.assign(globalThis, { extensionPrompts: asked });
      // The second button denies: an extension's request for a new host is refused, and only recorded.
      dialog.showMessageBox = (options: unknown) => {
        const { message } = options as { message: string };
        asked.push(message);
        return Promise.resolve({
          response: allowed.includes(message) ? 0 : 1,
          checkboxChecked: false,
        });
      };
    },
    { path: archive, allowed: typeof allow === 'string' ? [allow] : [...allow] },
  );
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
  readonly others: TestFiles;
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
  // Scripts as text, and binaries as bytes.
  const names = (await readdir(dist)).filter((name) => name !== 'manifest.json');
  const files = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        const bytes = await readFile(join(dist, name));
        return [
          name,
          name.endsWith('.js') ? bytes.toString('utf8') : new Uint8Array(bytes),
        ] as const;
      }),
    ),
  );
  const { 'main.js': main = '', ...others } = files;
  return { manifest: { ...manifest, id }, main: typeof main === 'string' ? main : '', others };
}

/** A control of the assistant bar, and where on the page the user would click it. */
interface BarControl {
  readonly name: string;
  readonly disabled: boolean;
  readonly x: number;
  readonly y: number;
}

interface KeptBar {
  readonly host: HTMLElement;
  readonly parts: { readonly input: HTMLElement };
}

/**
 * Runs in the adapter's isolated world, where YapYap keeps the bar: its
 * shadow root is closed, so nothing else, Playwright included, can look in.
 */
function readBarControls(): BarControl[] | null {
  const kept = (globalThis as { yapyapAssistantBarView?: KeptBar }).yapyapAssistantBarView;
  if (kept?.host.isConnected !== true) {
    return null;
  }
  kept.host.scrollIntoView({ block: 'center' });
  const root = kept.parts.input.getRootNode() as ShadowRoot;
  return (
    [
      ...root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        'button, input, select',
      ),
    ]
      // Controls inside a closed part of the bar take no room, and cannot be clicked.
      .filter((control) => !control.hidden && control.getClientRects().length > 0)
      .map((control) => {
        const box = control.getBoundingClientRect();
        return {
          name: control.getAttribute('aria-label') ?? control.textContent,
          disabled: control.disabled,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      })
  );
}

/** Runs in the adapter's isolated world, as {@link readBarControls} does: the bar's status line. */
function readBarStatus(): string | null {
  const kept = (globalThis as { yapyapAssistantBarView?: { parts: { status: HTMLElement } } })
    .yapyapAssistantBarView;
  return kept?.parts.status.textContent ?? null;
}

/** Runs in the adapter's isolated world: the longer text the bar shows, or null for none. */
function readBarResult(): string | null {
  const kept = (globalThis as { yapyapAssistantBarView?: { parts: { result: HTMLElement } } })
    .yapyapAssistantBarView;
  return kept === undefined || kept.parts.result.hidden ? null : kept.parts.result.textContent;
}

/** Runs `read` in the adapter's isolated world of WhatsApp's page, where the bar lives. */
const inBarWorld = async (app: ElectronApplication, read: () => unknown): Promise<unknown> =>
  (await whatsAppContents(app)).evaluate(
    (page, code): Promise<unknown> => page.executeJavaScriptInIsolatedWorld(1000, [{ code }]),
    `(${read.toString()})()`,
  );

/** The assistant bar's longer text, such as a summary or what is sent, or null while it shows none. */
export const assistantBarResult = async (app: ElectronApplication): Promise<string | null> => {
  const result = await inBarWorld(app, readBarResult);
  return typeof result === 'string' ? result : null;
};

/** The assistant bar's status line in the active account's WhatsApp, or null while it is not there. */
export const assistantBarStatus = async (app: ElectronApplication): Promise<string | null> => {
  const status = await inBarWorld(app, readBarStatus);
  return typeof status === 'string' ? status : null;
};

/** The assistant bar's controls in the active account's WhatsApp, or null while it is not there. */
export const assistantBarControls = async (
  app: ElectronApplication,
): Promise<BarControl[] | null> =>
  ((await inBarWorld(app, readBarControls)) ?? null) as BarControl[] | null;

/**
 * Clicks a control of the assistant bar as the user would, with the mouse:
 * the bar ignores clicks that page scripts make up.
 */
export async function clickInBar(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<void> {
  const find = async (): Promise<BarControl | undefined> =>
    (await assistantBarControls(app))?.find(
      (control) => control.name === name && !control.disabled,
    );
  await expect.poll(find, { message: `the bar’s ${name}` }).toBeDefined();
  const control = await find();
  if (control === undefined) {
    throw new Error(`The bar has no ${name}.`);
  }
  await page.mouse.click(control.x, control.y);
}
