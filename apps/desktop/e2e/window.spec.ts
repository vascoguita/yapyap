import type { ElectronApplication } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

const BOUNDS = { x: 60, y: 40, width: 900, height: 640 };

const mainBounds = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getNormalBounds());

async function exited(app: ElectronApplication, signal?: NodeJS.Signals): Promise<void> {
  const done = new Promise((resolve) => app.process().once('exit', resolve));
  if (signal === undefined) {
    await app.evaluate(({ app: electronApp }) => {
      setTimeout(() => {
        electronApp.quit();
      });
    });
  } else {
    app.process().kill(signal);
  }
  await done;
}

test('reopens the window where it was left, even after SIGTERM', async ({
  app,
  fakeWhatsApp,
  profile,
}) => {
  await whatsAppPage(app);
  await app.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()[0]?.setBounds(bounds);
  }, BOUNDS);
  await expect.poll(() => mainBounds(app)).toEqual(BOUNDS);
  // Windows has no SIGTERM: Node's kill() there ends the process outright, so
  // it quits normally instead.
  await exited(app, process.platform === 'win32' ? undefined : 'SIGTERM');
  const saved = JSON.parse(await readFile(join(profile, 'window-state.json'), 'utf8')) as object;
  expect(saved).toEqual({ bounds: BOUNDS, maximized: false, fullScreen: false });
  const again = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await whatsAppPage(again);
    await expect.poll(() => mainBounds(again)).toEqual(BOUNDS);
  } finally {
    await closeApp(again);
  }
});

test('starts with the default size when the saved state is corrupt', async ({
  app,
  fakeWhatsApp,
  profile,
}) => {
  // The default as this machine shows it: small screens shrink it to fit.
  await whatsAppPage(app);
  await expect.poll(() => mainBounds(app)).toBeDefined();
  const fresh = await mainBounds(app);
  await exited(app);
  await writeFile(join(profile, 'window-state.json'), '{"bounds":"nonsense"');
  const again = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await whatsAppPage(again);
    await expect
      .poll(async () => {
        const bounds = await mainBounds(again);
        return bounds === undefined ? undefined : [bounds.width, bounds.height];
      })
      .toEqual([fresh?.width, fresh?.height]);
  } finally {
    await closeApp(again);
  }
});

test('hides the menu bar when the setting says so', async ({ app }) => {
  test.skip(process.platform === 'darwin', 'macOS keeps its menu bar outside the window');
  await whatsAppPage(app);
  // Settings opens a second window, so find WhatsApp's by what it shows.
  const autoHidden = () =>
    app.evaluate(({ BrowserWindow, webContents }) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().startsWith('http'));
      return page === undefined
        ? undefined
        : BrowserWindow.fromWebContents(page)?.isMenuBarAutoHide();
    });
  expect(await autoHidden()).toBe(false);
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Settings…')
      ?.click();
  });
  const settings = await opened;
  await settings.waitForURL('app://chrome/settings.html');
  await settings.getByRole('checkbox', { name: 'Hide the menu bar' }).check();
  await expect.poll(autoHidden).toBe(true);
});
