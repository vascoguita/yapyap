import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** The call window, if one is open: whether it shows, and the session it runs on. */
const callWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const all = webContents.getAllWebContents();
    const call = all.find((contents) => contents.getURL().endsWith('/call.html'));
    const account = all.find(
      (contents) => contents.getURL().startsWith('http') && contents !== call,
    );
    if (call === undefined || account === undefined) {
      return null;
    }
    return {
      visible: BrowserWindow.fromWebContents(call)?.isVisible() ?? false,
      sameSession: call.session === account.session,
    };
  });

for (const button of ['call', 'call-blank']) {
  test(`keeps a WhatsApp call in a window of its account (${button})`, async ({ app, window }) => {
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    // call.js wires its buttons once the page has loaded.
    await window.waitForLoadState('load');
    await window.getByTestId(button).click();
    await expect.poll(() => callWindow(app)).toEqual({ visible: true, sameSession: true });
    // Playwright lists a new page a moment after Electron creates it.
    const isCall = (page: Page) => page.url().endsWith('/call.html');
    await expect.poll(() => app.windows().some(isCall)).toBe(true);
    const call = app.windows().find(isCall);
    if (call === undefined) {
      throw new Error('No call window.');
    }
    await call.getByTestId('hang-up').click();
    await expect.poll(() => callWindow(app)).toBeNull();
  });
}
