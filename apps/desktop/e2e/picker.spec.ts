import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

test.skip(process.platform === 'darwin', 'macOS uses its own system picker');

async function requestShare(app: ElectronApplication, window: Page): Promise<Page> {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Screen sharing is offered only to a focused window, and a virtual display
  // without a window manager focuses nothing on its own.
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
  await window.getByTestId('share-screen').click();
  const picker = await opened;
  await picker.waitForURL('app://chrome/picker.html');
  return picker;
}

test('shares the screen the user picks, with nothing preselected', async ({ app, window }) => {
  const picker = await requestShare(app, window);
  const screens = picker.getByRole('group', { name: 'Screens' });
  await expect(screens).toBeVisible();
  for (const radio of await picker.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  const share = picker.getByRole('button', { name: 'Share' });
  await expect(share).toBeDisabled();
  await expect(picker.getByRole('checkbox', { name: 'Also share system audio' })).toHaveCount(
    process.platform === 'win32' ? 1 : 0,
  );
  await screens.getByRole('radio').first().check();
  await share.click();
  await expect(window.getByTestId('share-result')).toHaveText('shared 1 video track');
  await expect.poll(() => picker.isClosed()).toBe(true);
});

test('denies the request when the user cancels', async ({ app, window }) => {
  const picker = await requestShare(app, window);
  await picker.getByRole('button', { name: 'Cancel' }).click();
  await expect(window.getByTestId('share-result')).toHaveText('NotAllowedError');
});

test('denies the request when the user closes the picker with Escape', async ({ app, window }) => {
  const picker = await requestShare(app, window);
  await expect(picker.getByRole('button', { name: 'Cancel' })).toBeVisible();
  // Only the key-down: the window closes before a key-up could reach it.
  await picker.keyboard.down('Escape');
  await expect(window.getByTestId('share-result')).toHaveText('NotAllowedError');
});
