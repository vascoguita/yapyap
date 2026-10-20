import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Replaces shell.openExternal so tests see every link that would leave the app. */
async function recordExternalLinks(app: ElectronApplication): Promise<() => Promise<string[]>> {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  return () => app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks);
}

const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

test('opens web, mail and phone links outside the app, each exactly once', async ({
  app,
  window,
}) => {
  const opened = await recordExternalLinks(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Playwright waits forever for a navigation the app cancels, so the links are
  // clicked from the page and everything after is checked from the main process.
  await window.evaluate(() => {
    for (const id of ['link-new-tab', 'link-same-tab', 'link-mailto', 'link-tel']) {
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click();
    }
  });
  await expect
    .poll(opened)
    .toEqual([
      'https://example.com/article?id=7#top',
      'https://example.com/same-tab',
      'mailto:someone@example.com?subject=Hi%20there',
      'tel:+351912345678',
    ]);
  expect(await windowCount(app)).toBe(1);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
    ),
  ).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
});

test('drops links with other schemes', async ({ app, window }) => {
  const opened = await recordExternalLinks(app);
  await window.getByTestId('link-file').click();
  await window.getByTestId('link-new-tab').click();
  await expect.poll(opened).toEqual(['https://example.com/article?id=7#top']);
});

test('follows a popup that navigates after opening, then closes it', async ({ app, window }) => {
  const opened = await recordExternalLinks(app);
  await window.getByTestId('popup-then-navigate').click();
  await expect.poll(opened).toEqual(['https://example.com/from-popup']);
  await expect.poll(() => windowCount(app)).toBe(1);
});

test('discards a popup that never navigates', async ({ app, window }) => {
  await window.getByTestId('popup-blank').click();
  await expect.poll(() => windowCount(app), { timeout: 15_000 }).toBe(1);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
});

test('handles whatsapp: links inside the app', async ({ window, fakeWhatsApp }) => {
  await window.getByTestId('link-deep').click();
  await expect.poll(() => window.url()).toBe(`${fakeWhatsApp.origin}/send?phone=351912345678`);
});
