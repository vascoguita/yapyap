import type { ElectronApplication, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

async function openSettings(app: ElectronApplication): Promise<Page> {
  // The WhatsApp window must exist first so the next window event is Settings'.
  await app.firstWindow();
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Settings…');
    item?.click();
  });
  const page = await opened;
  await page.waitForURL('app://chrome/settings.html');
  return page;
}

async function savedHardwareAcceleration(profile: string): Promise<unknown> {
  const text = await readFile(join(profile, 'settings.json'), 'utf8').catch(() => '{}');
  const saved = JSON.parse(text) as { reliability?: { hardwareAcceleration?: unknown } };
  return saved.reliability?.hardwareAcceleration;
}

test('puts Settings in the menu on the conventional shortcut', async ({ app }) => {
  // The menu is set just before the WhatsApp window is created.
  await app.firstWindow();
  const accelerator = await app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Settings…')?.accelerator,
  );
  expect(accelerator).toBe('CmdOrCtrl+,');
});

test('changes a setting from the keyboard, saves it and offers a restart', async ({
  app,
  profile,
}) => {
  const settings = await openSettings(app);
  await expect(settings.getByRole('heading', { name: 'Reliability' })).toBeVisible();
  const toggle = settings.getByRole('checkbox', { name: 'Use hardware acceleration' });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await settings.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(settings.getByRole('button', { name: 'Restart now' })).toBeVisible();
  await expect.poll(() => savedHardwareAcceleration(profile)).toBe(false);
  await settings.keyboard.press('Space');
  await expect(settings.getByRole('button', { name: 'Restart now' })).toBeHidden();
  await expect.poll(() => savedHardwareAcceleration(profile)).toBe(true);
});

test('restarts the app from the restart notice', async ({ app }) => {
  await app.evaluate(({ app: electronApp }) => {
    const calls: string[] = [];
    Object.assign(globalThis, { restartCalls: calls });
    const relaunch = electronApp.relaunch.bind(electronApp);
    const quit = electronApp.quit.bind(electronApp);
    // Record the calls, then put the real methods back so the test can still close the app.
    electronApp.relaunch = () => {
      calls.push('relaunch');
      electronApp.relaunch = relaunch;
    };
    electronApp.quit = () => {
      calls.push('quit');
      electronApp.quit = quit;
    };
  });
  const settings = await openSettings(app);
  await settings.getByRole('checkbox', { name: 'Use hardware acceleration' }).click();
  await settings.getByRole('button', { name: 'Restart now' }).click();
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { restartCalls: string[] }).restartCalls),
    )
    .toEqual(['relaunch', 'quit']);
});

test('opens one Settings window and closes it with Escape', async ({ app }) => {
  const settings = await openSettings(app);
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Settings…')
      ?.click();
  });
  expect(app.windows().filter((page) => page.url().endsWith('/settings.html'))).toHaveLength(1);
  // Only the key-down: the window closes before a key-up could reach it, and
  // can close before Playwright hears back about the key-down itself.
  await settings.keyboard.down('Escape').catch(() => undefined);
  await expect.poll(() => settings.isClosed()).toBe(true);
});
