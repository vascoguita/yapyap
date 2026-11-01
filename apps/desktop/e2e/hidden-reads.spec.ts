import type { ElectronApplication } from '@playwright/test';
import {
  closeApp,
  expect,
  launchApp,
  seedSettings,
  test,
  whatsAppContents,
  whatsAppPage,
} from './fixtures.ts';

// Chromium reports a hidden or minimized window's page as hidden only while
// background throttling is on, which keeps WhatsApp from marking messages
// read. Playwright keeps pages it drives active, so these tests check the
// throttling YapYap sets rather than the page's visibility (#66).
const throttling = async (app: ElectronApplication) =>
  (await whatsAppContents(app)).evaluate((contents) => contents.getBackgroundThrottling());

test('keeps chats unread while hidden by default', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await throttling(app)).toBe(true);
});

test('lets WhatsApp keep reading while hidden when the setting is off', async ({
  fakeWhatsApp,
  profile,
}) => {
  await seedSettings(profile, { privacy: { unreadWhileHidden: false } });
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    expect(await throttling(app)).toBe(false);
  } finally {
    await closeApp(app);
  }
});
