import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function clickAccountItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.find((menu) => menu.label.replaceAll('&', '') === 'Account')
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

test('clears the cache and reloads WhatsApp, keeping the login', async ({ app, window }) => {
  await prepare(window);
  await clickAccountItem(app, 'Clear Cache and Reload');
  await reloaded(window);
  expect(await login(window)).toBe('linked');
});

test('resets the session only once the user confirms', async ({ app, window }) => {
  await prepare(window);
  await app.evaluate(({ dialog }) => {
    const answers = [1, 0];
    Object.assign(dialog, {
      showMessageBox: () =>
        Promise.resolve({ response: answers.shift() ?? 1, checkboxChecked: false }),
    });
  });
  await clickAccountItem(app, 'Reset Session…');
  await expect.poll(() => window.evaluate(() => 'beforeReload' in window)).toBe(true);
  expect(await login(window)).toBe('linked');
  await clickAccountItem(app, 'Reset Session…');
  await reloaded(window);
  expect(await login(window)).toBeNull();
});
