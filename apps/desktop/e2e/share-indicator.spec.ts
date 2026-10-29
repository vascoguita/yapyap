import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test, whatsAppPage } from './fixtures.ts';

test.skip(process.platform === 'darwin', 'macOS uses its own system picker');

/** Adds a second account, so the sidebar shows, and returns its WhatsApp page. */
async function secondAccount(app: ElectronApplication, first: Page): Promise<Page> {
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Add Account')
      ?.click();
  });
  const page = await whatsAppPage(app, first);
  await page.waitForLoadState('load');
  return page;
}

const sidebarOf = async (app: ElectronApplication): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith('/sidebar.html')))
    .toBe(true);
  const sidebar = app.windows().find((page) => page.url().endsWith('/sidebar.html'));
  if (sidebar === undefined) {
    throw new Error('No sidebar.');
  }
  return sidebar;
};

/** Shares the first screen through YapYap's picker, as the picker tests do. */
async function shareScreen(app: ElectronApplication, page: Page): Promise<void> {
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const [main] = BrowserWindow.getAllWindows();
        main?.focus();
        return main?.isFocused();
      }),
    )
    .toBe(true);
  const opened = app.waitForEvent('window');
  await page.getByTestId('share-keep').click();
  const picker = await opened;
  await picker.waitForURL('app://chrome/picker.html');
  await picker.getByRole('group', { name: 'Screens' }).getByRole('radio').first().check();
  await picker
    .getByRole('button', { name: 'Share' })
    .click()
    .catch(() => undefined);
  await expect(page.getByTestId('share-status')).toHaveText('sharing');
}

test('shows a running share in the sidebar until it ends, however it ends', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const work = await secondAccount(app, window);
  const sidebar = await sidebarOf(app);
  const stop = sidebar.getByRole('button', { name: 'Stop sharing your screen in WhatsApp 2' });
  await shareScreen(app, work);
  await stop.click();
  await expect(work.getByTestId('share-status')).toHaveText('ended');
  await expect(stop).toHaveCount(0);
  await shareScreen(app, work);
  await expect(stop).toBeVisible();
  await work.getByTestId('share-stop').click();
  await expect(stop).toHaveCount(0);
});
