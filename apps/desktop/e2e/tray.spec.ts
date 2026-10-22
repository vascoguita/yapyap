import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { closeApp, expect, launchApp, test } from './fixtures.ts';

const whatsApp = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith('http'),
    );
    return window === undefined ? 'gone' : `visible=${String(window.isVisible())}`;
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
    await expect((await app.firstWindow()).getByTestId('fake-whatsapp')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((candidate) => candidate.webContents.getURL().startsWith('http'))
        ?.close();
    });
    await expect.poll(() => whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});

test('starts hidden when Start minimized is on', async ({ fakeWhatsApp, profile }) => {
  const app = await launchWith(fakeWhatsApp.origin, profile, { startMinimized: true });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('load');
    // Longer than the fallback that shows a window which never reports ready.
    await window.waitForTimeout(3500);
    expect(await whatsApp(app)).toBe('visible=false');
  } finally {
    await closeApp(app);
  }
});
