import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { signedArchive, testKey, zipArchive } from '../test/plugins.ts';
import { expect, test } from './fixtures.ts';

/** Clicks a menu item by its label, wherever it sits in the application menu. */
const clickMenu = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);

const chromePage = async (app: ElectronApplication, path: string): Promise<Page> => {
  await expect.poll(() => app.windows().some((page) => page.url().endsWith(path))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().endsWith(path));
  if (page === undefined) {
    throw new Error(`No ${path}.`);
  }
  return page;
};

test('installs a third-party plugin only once the user accepts the risk, and marks it', async ({
  app,
  profile,
}) => {
  // Signed with a key made for this run and kept in memory (ADR 0005).
  const archive = join(profile, 'hello.yapyap-plugin');
  await writeFile(archive, zipArchive(signedArchive(testKey())));
  await app.evaluate(({ dialog }, path) => {
    const messages: string[] = [];
    Object.assign(globalThis, { pluginMessages: messages });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = (options: unknown) => {
      messages.push((options as { message: string }).message);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await expect(consent.getByRole('heading', { name: 'Install Hello?' })).toBeVisible();
  await expect(consent.getByText(/you install it at your own risk/)).toBeVisible();
  const install = consent.getByRole('button', { name: 'Install' });
  await expect(install).toBeDisabled();
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  // Install closes the window, which can end the click before Playwright sees it
  // finish; the poll below checks that it installed.
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { pluginMessages: string[] }).pluginMessages),
    )
    .toEqual(['Hello 1.0.0 is installed.']);
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await expect(plugins.getByText('org.example.hello')).toBeVisible();
  await expect(plugins.getByText('Third-party')).toBeVisible();
});
