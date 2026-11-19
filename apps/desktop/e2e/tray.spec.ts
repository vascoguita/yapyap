import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { LOGIN_FLAG } from '../src/main/autostart/login-launch.ts';
import { SHOW_FALLBACK_MS } from '../src/main/window/show-when-ready.ts';
import {
  closeApp,
  expect,
  launchApp,
  mainWindow,
  seedSettings,
  test,
  whatsAppPage,
} from './fixtures.ts';

const whatsApp = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('http'));
    const window = page === undefined ? null : BrowserWindow.fromWebContents(page);
    return window === null ? 'gone' : `visible=${String(window.isVisible())}`;
  });

async function launchWith(
  origin: string,
  profile: string,
  general: object,
  args: readonly string[] = [],
) {
  await seedSettings(profile, { general });
  return launchApp(origin, profile, args);
}

test('keeps running hidden when the window closes, with Close to the tray on', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await launchWith(fakeWhatsApp.origin, profile, { closeToTray: true });
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    // Closing before YapYap first shows the window would race that first show.
    await expect.poll(() => whatsApp(app)).toBe('visible=true');
    const main = await mainWindow(app);
    await main.evaluate((window) => {
      window.close();
    });
    await expect.poll(() => whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});

test('starts hidden at login in the background, even when it was last maximized', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Maximizing shows a hidden window, so a maximized window must stay hidden too.
  await writeFile(
    join(profile, 'window-state.json'),
    JSON.stringify({ maximized: true, fullScreen: false }),
  );
  const app = await launchWith(fakeWhatsApp.origin, profile, { startMinimized: true }, [
    LOGIN_FLAG,
  ]);
  try {
    const window = await whatsAppPage(app);
    await window.waitForLoadState('load');
    // Nothing signals that the window stayed hidden, so the test waits out the
    // fallback that shows a window which never reports ready.
    await window.waitForTimeout(SHOW_FALLBACK_MS + 500);
    expect(await whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});

test('shows the window when the user opens YapYap, even set to start in the background', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await launchWith(fakeWhatsApp.origin, profile, { startMinimized: true });
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect(async () => {
      expect(await whatsApp(app)).toBe('visible=true');
    }).toPass();
  } finally {
    await closeApp(app);
  }
});
