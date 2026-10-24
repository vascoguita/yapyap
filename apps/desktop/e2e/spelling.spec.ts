import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Records each context menu instead of showing it, which Playwright cannot see. */
const recordMenus = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const shown: Electron.Menu[] = [];
    Object.assign(globalThis, { shownMenus: shown });
    Menu.prototype.popup = function record(this: Electron.Menu) {
      shown.push(this);
    };
  });

const lastMenu = (app: ElectronApplication): Promise<string[] | undefined> =>
  app.evaluate(() =>
    (globalThis as unknown as { shownMenus: Electron.Menu[] }).shownMenus
      .at(-1)
      ?.items.map((item) => item.label),
  );

test('offers editing on a right click in the message box, and leads to Settings for spelling', async ({
  app,
  window,
}) => {
  await recordMenus(app);
  await window.getByTestId('composer').click({ button: 'right' });
  await expect
    .poll(() => lastMenu(app))
    .toEqual(['Cut', 'Copy', 'Paste', '', 'Select All', '', 'Check Spelling…']);
  const opened = app.waitForEvent('window');
  await app.evaluate(() => {
    (globalThis as unknown as { shownMenus: Electron.Menu[] }).shownMenus
      .at(-1)
      ?.items.at(-1)
      ?.click();
  });
  const settings = await opened;
  await settings.waitForURL('app://chrome/settings.html');
  await expect(settings.getByRole('checkbox', { name: 'Check spelling' })).not.toBeChecked();
});

test('shows no menu where there is nothing to edit or copy', async ({ app, window }) => {
  test.skip(
    process.platform === 'darwin',
    'macOS selects the word under the pointer on a right click, so Copy is offered there.',
  );
  await recordMenus(app);
  await window.getByTestId('fake-whatsapp').click({ button: 'right', position: { x: 2, y: 2 } });
  await window.getByTestId('composer').click({ button: 'right' });
  await expect.poll(() => lastMenu(app)).toBeDefined();
  const count = await app.evaluate(
    () => (globalThis as unknown as { shownMenus: Electron.Menu[] }).shownMenus.length,
  );
  expect(count).toBe(1);
});
