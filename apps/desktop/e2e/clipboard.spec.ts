import type { ElectronApplication, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

// A 1×1 PNG, standing in for a screenshot.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Puts one item on the system clipboard, as another app would. */
async function copy(app: ElectronApplication, type: string, data: string): Promise<void> {
  await app.evaluate(
    async (electron, item) => {
      const { clipboard, ClipboardItem } = electron as unknown as {
        clipboard: { write(items: unknown[]): Promise<void> };
        ClipboardItem: new (data: Record<string, unknown>) => unknown;
      };
      const value =
        item.type === 'image/png'
          ? new Blob([Buffer.from(item.data, 'base64')], { type: item.type })
          : item.data;
      await clipboard.write([new ClipboardItem({ [item.type]: value })]);
    },
    { type, data },
  );
}

async function pasteIntoComposer(window: Page): Promise<unknown> {
  await window.getByTestId('composer').click();
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(window.getByTestId('paste-result')).not.toBeEmpty();
  return JSON.parse((await window.getByTestId('paste-result').textContent()) ?? 'null');
}

test('pastes an image copied from a browser or screenshot tool', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await copy(app, 'image/png', PNG);
  expect(await pasteIntoComposer(window)).toEqual([expect.objectContaining({ type: 'image/png' })]);
});

test('pastes an image file copied in a Linux file manager', async ({ app, window, profile }) => {
  test.skip(process.platform !== 'linux', 'file managers elsewhere use native file formats');
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const file = join(profile, 'holiday.png');
  await writeFile(file, Buffer.from(PNG, 'base64'));
  await copy(app, 'text/uri-list', `file://${file}\r\n`);
  expect(await pasteIntoComposer(window)).toEqual([
    expect.objectContaining({ name: 'holiday.png', type: 'image/png' }),
  ]);
});

test('lets WhatsApp neither read the clipboard nor write it on its own', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('load-write')).not.toBeEmpty();
  expect(await window.getByTestId('load-write').textContent()).not.toBe('allowed');
  await copy(app, 'text/plain', 'private note');
  const read = await window.evaluate(() =>
    navigator.clipboard.readText().then(
      () => 'allowed',
      (error: unknown) => (error instanceof Error ? error.name : 'failed'),
    ),
  );
  expect(read).not.toBe('allowed');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('private note');
});
