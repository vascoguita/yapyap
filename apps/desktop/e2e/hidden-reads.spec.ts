import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { closeApp, expect, launchApp, test } from './fixtures.ts';

// Chromium reports a hidden or minimized window's page as hidden only while
// background throttling is on, which keeps WhatsApp from marking messages
// read. Playwright keeps pages it drives active, so these tests check the
// throttling YapYap sets rather than the page's visibility (#66).
const throttling = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith('http'))
      ?.webContents.getBackgroundThrottling(),
  );

test('keeps chats unread while hidden by default', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await throttling(app)).toBe(true);
});

test('lets WhatsApp keep reading while hidden when the setting is off', async ({
  fakeWhatsApp,
  profile,
}) => {
  await writeFile(
    join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 3, privacy: { unreadWhileHidden: false } }),
  );
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await app.firstWindow()).getByTestId('fake-whatsapp')).toBeVisible();
    expect(await throttling(app)).toBe(false);
  } finally {
    await closeApp(app);
  }
});
