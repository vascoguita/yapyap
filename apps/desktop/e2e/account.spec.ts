import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Clicks an item of Account › Troubleshoot, where the fixes for a misbehaving account sit. */
async function clickTroubleshootItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.find((menu) => menu.label.replaceAll('&', '') === 'Account')
      ?.submenu?.items.find((item) => item.label === 'Troubleshoot')
      ?.submenu?.items.find((item) => item.label === wanted)
      ?.click();
  }, label);
}

/** Marks the page and stores a stand-in for WhatsApp's login data. */
async function prepare(window: Page): Promise<void> {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate(() => {
    localStorage.setItem('login', 'linked');
    Object.assign(window, { beforeReload: true });
  });
}

const reloaded = (window: Page) =>
  expect
    .poll(() => window.evaluate(() => !('beforeReload' in window)).catch(() => false))
    .toBe(true);

const login = (window: Page) => window.evaluate(() => localStorage.getItem('login'));

test('reloads WhatsApp from the View menu, whatever has the focus', async ({ app, window }) => {
  await prepare(window);
  // A click from main has no focused page, the case Electron's own reload role ignores.
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.find((menu) => menu.label.replaceAll('&', '') === 'View')
      ?.submenu?.items.find((item) => item.label === 'Reload')
      ?.click();
  });
  await reloaded(window);
  expect(await login(window)).toBe('linked');
});

test('clears the cache and reloads WhatsApp, keeping the login', async ({ app, window }) => {
  await prepare(window);
  await clickTroubleshootItem(app, 'Clear Cache and Reload');
  await reloaded(window);
  expect(await login(window)).toBe('linked');
});

test('logs out and deletes the data only once the user confirms', async ({ app, window }) => {
  await prepare(window);
  await app.evaluate(({ dialog }) => {
    const answers = [1, 0];
    Object.assign(dialog, {
      showMessageBox: () =>
        Promise.resolve({ response: answers.shift() ?? 1, checkboxChecked: false }),
    });
  });
  await clickTroubleshootItem(app, 'Log Out and Delete Data…');
  await expect.poll(() => window.evaluate(() => 'beforeReload' in window)).toBe(true);
  expect(await login(window)).toBe('linked');
  await clickTroubleshootItem(app, 'Log Out and Delete Data…');
  await reloaded(window);
  expect(await login(window)).toBeNull();
});
