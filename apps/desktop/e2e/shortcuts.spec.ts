import { shortcutsFor } from '../src/shared/shortcuts.ts';
import { openFromMenu } from './chrome-helpers.ts';
import { expect, test, whatsAppPage } from './fixtures.ts';

test('binds every listed shortcut in the menus, and lists them all in Settings', async ({
  app,
}) => {
  // The menu is set just before the WhatsApp window is created.
  await whatsAppPage(app);
  const bound = await app.evaluate(({ Menu }) => {
    const accelerators: string[] = [];
    const walk = (items: Electron.MenuItem[]): void => {
      for (const item of items) {
        // Typed as always there, but items without a shortcut have none.
        const accelerator: unknown = item.accelerator;
        if (typeof accelerator === 'string') {
          accelerators.push(accelerator);
        }
        walk(item.submenu?.items ?? []);
      }
    };
    walk(Menu.getApplicationMenu()?.items ?? []);
    return accelerators;
  });
  const listed = shortcutsFor(process.platform);
  for (const shortcut of listed) {
    expect(bound, `${shortcut.label} is on a menu item`).toContain(shortcut.accelerator);
  }
  const window = await openFromMenu(app, 'Keyboard Shortcuts…', 'settings.html#shortcuts');
  // The header row, one per shortcut, and the shortcut that works from any app.
  await expect(window.getByRole('row')).toHaveCount(listed.length + 2);
  await expect(window.getByRole('cell', { name: 'Open Settings', exact: true })).toBeVisible();
});

test('changes a shortcut by pressing the new keys, and the menu follows', async ({ app }) => {
  const window = await openFromMenu(app, 'Keyboard Shortcuts…', 'settings.html#shortcuts');
  // ⌘ on macOS and Ctrl elsewhere, which YapYap writes as CmdOrCtrl.
  await window.getByRole('button', { name: 'Change: Open Settings' }).click();
  await expect(window.getByRole('status')).toBeVisible();
  await window.keyboard.press('ControlOrMeta+Alt+KeyS');
  await expect(window.getByRole('button', { name: 'Reset: Open Settings' })).toBeVisible();
  const settingsKeys = () =>
    app.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()
          ?.items.flatMap((menu) => menu.submenu?.items ?? [])
          .find((item) => item.label === 'Settings…')?.accelerator,
    );
  await expect.poll(settingsKeys).toBe('CmdOrCtrl+Alt+S');
  await window.getByRole('button', { name: 'Change: Zoom in' }).click();
  await expect(window.getByRole('status')).toBeVisible();
  await window.keyboard.press('ControlOrMeta+Alt+KeyS');
  await expect(window.getByText('Those keys are already used for “Open Settings”.')).toBeVisible();
  await window.getByRole('button', { name: 'Reset: Open Settings' }).click();
  await expect.poll(settingsKeys).toBe('CmdOrCtrl+,');
});

test('takes keys from any app for showing YapYap, and gives them back', async ({ app }) => {
  const window = await openFromMenu(app, 'Keyboard Shortcuts…', 'settings.html#shortcuts');
  const label = 'Show or hide YapYap, from any app';
  await window.getByRole('button', { name: `Change: ${label}` }).click();
  await expect(window.getByRole('status')).toBeVisible();
  await window.keyboard.press('ControlOrMeta+Alt+KeyY');
  await expect(window.getByRole('button', { name: `Remove: ${label}` })).toBeVisible();
  const registered = () =>
    app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CmdOrCtrl+Alt+Y'));
  await expect.poll(registered).toBe(true);
  await window.getByRole('button', { name: `Remove: ${label}` }).click();
  await expect.poll(registered).toBe(false);
});

test('keeps Settings open on Escape while it waits for keys, and closes on the next', async ({
  app,
}) => {
  const window = await openFromMenu(app, 'Keyboard Shortcuts…', 'settings.html#shortcuts');
  await expect(window.getByRole('heading', { name: 'Keyboard shortcuts', level: 1 })).toBeVisible();
  await window.getByRole('button', { name: 'Change: Zoom in' }).click();
  await expect(window.getByRole('status')).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(window.getByRole('status')).toBeHidden();
  expect(window.isClosed()).toBe(false);
  // Escape closes the window, which can end the key press before Playwright
  // sees it finish; the window closing is what shows it worked.
  await Promise.all([
    window.waitForEvent('close'),
    window.keyboard.press('Escape').catch(() => undefined),
  ]);
});
