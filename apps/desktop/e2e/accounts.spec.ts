import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

/** Where the WhatsApp page's session keeps its data on disk. */
const storagePath = (app: Awaited<ReturnType<typeof launchApp>>) =>
  app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('http'))
      ?.session.getStoragePath(),
  );

test('keeps the account’s WhatsApp session in its own partition across restarts', async ({
  fakeWhatsApp,
  profile,
}) => {
  const first = await launchApp(fakeWhatsApp.origin, profile);
  let id: string;
  try {
    const page = await whatsAppPage(first);
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
      active: string;
    };
    id = saved.active;
    // macOS may report the profile's real path (/private/var for /var), so compare the tail.
    expect(await storagePath(first)).toMatch(
      new RegExp(String.raw`[\\/]Partitions[\\/]account-${id}$`),
    );
    await page.evaluate(() => {
      localStorage.setItem('yapyap-e2e', 'kept');
    });
  } finally {
    await closeApp(first);
  }
  const second = await launchApp(fakeWhatsApp.origin, profile);
  try {
    const page = await whatsAppPage(second);
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('yapyap-e2e'))).toBe('kept');
    const again = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
      active: string;
    };
    expect(again.active).toBe(id);
  } finally {
    await closeApp(second);
  }
});

/** Clicks an item of the Account menu by its label. */
async function clickAccountMenu(app: Awaited<ReturnType<typeof launchApp>>, label: string) {
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
}

/** The WhatsApp pages, and which one the window shows. */
const accountPages = (app: Awaited<ReturnType<typeof launchApp>>) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    // A view's page keeps its window after the view is taken out, so ask the window.
    const shown = new Set(
      BrowserWindow.getAllWindows().flatMap((window) =>
        window.contentView.children.map((view) => (view as Electron.WebContentsView).webContents),
      ),
    );
    return webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith('http'))
      .map((contents) => ({
        storage: contents.session.getStoragePath() ?? '',
        shown: shown.has(contents),
      }));
  });

test('adds, switches and removes accounts, each in its own session', async ({
  app,
  window,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate(() => {
    localStorage.setItem('yapyap-e2e', 'first account');
  });
  await clickAccountMenu(app, 'Add Account');
  await expect.poll(async () => (await accountPages(app)).length).toBe(2);
  // Playwright lists a new page a moment after Electron creates it.
  const isSecond = (page: Page) => page !== window && page.url().startsWith('http');
  await expect.poll(() => app.windows().some(isSecond)).toBe(true);
  const second = app.windows().find(isSecond);
  await expect(second?.getByTestId('fake-whatsapp') ?? window.locator('missing')).toBeVisible();
  // A new account shares nothing with the first one.
  expect(await second?.evaluate(() => localStorage.getItem('yapyap-e2e'))).toBeNull();
  const shownStorage = async () =>
    (await accountPages(app)).filter((page) => page.shown).map((page) => page.storage);
  const first = (await accountPages(app)).find((page) => !page.shown)?.storage ?? '';
  expect(await shownStorage()).not.toEqual([first]);
  await clickAccountMenu(app, 'WhatsApp');
  await expect.poll(shownStorage).toEqual([first]);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  });
  await clickAccountMenu(app, 'Remove Account…');
  await expect.poll(async () => (await accountPages(app)).length).toBe(1);
  const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
    accounts: unknown[];
  };
  expect(saved.accounts).toHaveLength(1);
});

test('renames an account and turns another off from the Accounts window', async ({
  app,
  window,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickAccountMenu(app, 'Add Account');
  await expect.poll(async () => (await accountPages(app)).length).toBe(2);
  await clickAccountMenu(app, 'Manage Accounts…');
  // Adding the account also opened a page, so find the window by its address.
  await expect
    .poll(() => app.windows().some((page) => page.url() === 'app://chrome/accounts.html'))
    .toBe(true);
  const manage = app.windows().find((page) => page.url() === 'app://chrome/accounts.html');
  if (manage === undefined) {
    throw new Error('The Accounts window did not open.');
  }
  // The window opens on the account on screen: the one just added.
  await expect(manage.getByLabel('Name')).toHaveValue('WhatsApp 2');
  // Nothing was allowed yet, so the account asks before using the camera.
  await expect(manage.getByRole('heading', { name: 'Permissions' })).toBeVisible();
  await expect(manage.getByText('Asks first')).toHaveCount(2);
  await expect(
    manage.getByRole('button', { name: 'Ask Again for Camera and Microphone' }),
  ).toBeDisabled();
  await manage.getByLabel('Name').fill('Work');
  await manage.getByLabel('Run this account').uncheck();
  await manage.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await accountPages(app)).length).toBe(1);
  await manage.getByRole('button', { name: /^WhatsApp/ }).click();
  await manage.getByLabel('Name').fill('Personal');
  await manage.getByRole('button', { name: 'Save' }).click();
  await manage.getByLabel('Run this account').uncheck();
  await manage.getByRole('button', { name: 'Save' }).click();
  await expect(manage.getByRole('alert')).toContainText('must keep running');
  const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
    accounts: { name: string; enabled: boolean }[];
  };
  expect(saved.accounts.map(({ name, enabled }) => [name, enabled])).toEqual([
    ['Personal', true],
    ['Work', false],
  ]);
  const menuLabels = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items.flatMap((menu) =>
      (menu.submenu?.items ?? []).map((entry) => entry.label),
    ),
  );
  expect(menuLabels).toContain('Personal');
  expect(menuLabels).not.toContain('Work');
});
