import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

const whatsApp = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('http'));
    const window = page === undefined ? null : BrowserWindow.fromWebContents(page);
    return window === null ? 'gone' : `visible=${String(window.isVisible())}`;
  });

async function launchWith(origin: string, profile: string, general: object) {
  await writeFile(join(profile, 'settings.json'), JSON.stringify({ schemaVersion: 4, general }));
  return launchApp(origin, profile);
}

test.skip(process.platform === 'darwin', 'macOS always keeps YapYap in the Dock instead');

test('keeps running hidden when the window closes, with Close to the tray on', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await launchWith(fakeWhatsApp.origin, profile, { closeToTray: true });
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    // Closing before YapYap first shows the window would race that first show.
    await expect.poll(() => whatsApp(app)).toBe('visible=true');
    await app.evaluate(({ BaseWindow }) => {
      // The main window is the only one open.
      BaseWindow.getAllWindows()[0]?.close();
    });
    await expect.poll(() => whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});

test('starts hidden when Start minimized is on, even when it was last maximized', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Maximizing shows a hidden window, so a maximized window must stay hidden too.
  await writeFile(
    join(profile, 'window-state.json'),
    JSON.stringify({ maximized: true, fullScreen: false }),
  );
  const app = await launchWith(fakeWhatsApp.origin, profile, { startMinimized: true });
  try {
    const window = await whatsAppPage(app);
    await window.waitForLoadState('load');
    // Longer than the fallback that shows a window which never reports ready.
    await window.waitForTimeout(3500);
    expect(await whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});
