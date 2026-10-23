import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const sidebarPage = async (app: ElectronApplication): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith('/sidebar.html')))
    .toBe(true);
  const page = app.windows().find((candidate) => candidate.url().endsWith('/sidebar.html'));
  if (page === undefined) {
    throw new Error('No sidebar.');
  }
  return page;
};

/** Where each view sits in the main window: the sidebar first, then the accounts. */
const layout = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().flatMap((window) =>
      window.contentView.children.map((view) => ({
        url: (view as Electron.WebContentsView).webContents.getURL(),
        x: view.getBounds().x,
        width: view.getBounds().width,
      })),
    ),
  );

test('switches accounts from the sidebar, which appears with a second account', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect((await layout(app)).map((view) => view.x)).toEqual([0]);
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Add Account')
      ?.click();
  });
  const sidebar = await sidebarPage(app);
  const first = sidebar.getByRole('button', { name: 'WhatsApp', exact: true });
  const second = sidebar.getByRole('button', { name: 'WhatsApp 2', exact: true });
  await expect(second).toHaveAttribute('aria-current', 'page');
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'page');
  await expect(second).not.toHaveAttribute('aria-current', 'page');
  const views = await layout(app);
  const bar = views.find((view) => view.url.endsWith('/sidebar.html'));
  expect(bar).toMatchObject({ x: 0, width: 220 });
  expect(views.filter((view) => view.url.startsWith('http')).map((view) => view.x)).toEqual([220]);
  await sidebar.getByRole('button', { name: 'Show only avatars' }).click();
  await expect(first).toHaveText('W');
  await expect
    .poll(async () => (await layout(app)).find((view) => view.url.endsWith('/sidebar.html'))?.width)
    .toBe(64);
});
