import type { ElectronApplication, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, whatsAppPage } from './fixtures.ts';

const PANEL = 'app://chrome/quick-panel.html';

async function openSettings(app: ElectronApplication): Promise<Page> {
  await whatsAppPage(app);
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Settings…')
      ?.click();
  });
  await expect
    .poll(() => app.windows().some((page) => page.url() === 'app://chrome/settings.html'))
    .toBe(true);
  const page = app.windows().find((candidate) => candidate.url() === 'app://chrome/settings.html');
  if (page === undefined) {
    throw new Error('Settings did not open.');
  }
  return page;
}

/** The panel's window, if one is open: whether it shows, and whether it stays on top. */
const panelWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }, url) => {
    const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);
    const window = contents === undefined ? null : BrowserWindow.fromWebContents(contents);
    return window === null ? null : { onTop: window.isAlwaysOnTop() };
  }, PANEL);

const mainVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const whatsApp = webContents
      .getAllWebContents()
      .find((page) => page.getURL().startsWith('http'));
    return whatsApp === undefined
      ? false
      : (BrowserWindow.fromWebContents(whatsApp)?.isVisible() ?? false);
  });

test('offers a panel on top of other apps while YapYap’s window is hidden', async ({
  app,
  profile,
}) => {
  const settings = await openSettings(app);
  const panelGroup = settings.getByRole('group', { name: 'Quick access panel', exact: true });
  await expect(panelGroup.getByRole('radio', { name: 'Off' })).toBeChecked();
  await panelGroup.getByRole('radio', { name: 'While YapYap’s window is hidden' }).check();
  expect(await panelWindow(app)).toBeNull();
  await app.evaluate(({ BrowserWindow, webContents }) => {
    const whatsApp = webContents
      .getAllWebContents()
      .find((page) => page.getURL().startsWith('http'));
    if (whatsApp !== undefined) {
      BrowserWindow.fromWebContents(whatsApp)?.hide();
    }
  });
  await expect.poll(() => panelWindow(app)).toEqual({ onTop: true });
  await expect.poll(() => app.windows().some((page) => page.url() === PANEL)).toBe(true);
  const panel = app.windows().find((page) => page.url() === PANEL);
  if (panel === undefined) {
    throw new Error('The panel did not open.');
  }
  await panel.getByRole('checkbox', { name: 'Do not disturb' }).check();
  await expect
    .poll(async () => {
      const saved = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')) as {
        general?: { doNotDisturb?: boolean };
      };
      return saved.general?.doNotDisturb;
    })
    .toBe(true);
  // An account in the panel brings YapYap's window back, which the panel then leaves to it.
  await panel.getByRole('button', { name: /^WhatsApp/ }).click();
  await expect.poll(() => mainVisible(app)).toBe(true);
  await expect.poll(() => panelWindow(app)).toBeNull();
});
