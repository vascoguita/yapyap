import type { ElectronApplication } from '@playwright/test';
import { LOGIN_FLAG } from '../src/main/autostart/login-launch.ts';
import {
  closeApp,
  expect,
  launchApp,
  mainWindow,
  seedSettings,
  test,
  whatsAppPage,
} from './fixtures.ts';

const inDock = (app: ElectronApplication) =>
  app.evaluate(({ app: electron }) => electron.dock?.isVisible());

const visible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('http'));
    const window = page === undefined ? null : BrowserWindow.fromWebContents(page);
    return window?.isVisible() ?? false;
  });

test('closes to the menu bar alone, and takes the Dock back when the window shows', async ({
  fakeWhatsApp,
  profile,
}) => {
  await seedSettings(profile, { general: { closeToTray: true } });
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    // Closing before YapYap first shows the window would race that first show.
    await expect(async () => {
      expect(await visible(app)).toBe(true);
    }).toPass();
    expect(await inDock(app)).toBe(true);
    const main = await mainWindow(app);
    await main.evaluate((window) => {
      window.close();
    });
    await expect(async () => {
      expect(await inDock(app)).toBe(false);
    }).toPass();
    expect(await visible(app)).toBe(false);
    await main.evaluate((window) => {
      window.show();
    });
    await expect(async () => {
      expect(await inDock(app)).toBe(true);
    }).toPass();
  } finally {
    await closeApp(app);
  }
});

test('keeps the Dock icon when the window closes, with Close to the menu bar off', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect(async () => {
      expect(await visible(app)).toBe(true);
    }).toPass();
    const main = await mainWindow(app);
    await main.evaluate((window) => {
      window.close();
    });
    await expect(async () => {
      expect(await visible(app)).toBe(false);
    }).toPass();
    expect(await inDock(app)).toBe(true);
  } finally {
    await closeApp(app);
  }
});

test('starts at login in the menu bar alone, in the background', async ({
  fakeWhatsApp,
  profile,
}) => {
  await seedSettings(profile, { general: { startMinimized: true } });
  const app = await launchApp(fakeWhatsApp.origin, profile, [LOGIN_FLAG]);
  try {
    await (await whatsAppPage(app)).waitForLoadState('load');
    await expect(async () => {
      expect(await inDock(app)).toBe(false);
    }).toPass();
    expect(await visible(app)).toBe(false);
  } finally {
    await closeApp(app);
  }
});
