import { expectedLinuxBackend } from './app-environment.ts';
import { expect, test } from './fixtures.ts';

test.skip(process.platform !== 'linux', 'Display backends exist only on Linux');

test('draws the WhatsApp page on the display backend it reports', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Copy Diagnostics')
      ?.click();
  });
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toContain(`, display ${expectedLinuxBackend()} (automatic)\n`);
  // A blank or black window paints a single color; the fake page has text on a background.
  const colors = await app.evaluate(async ({ BrowserWindow }) => {
    const shown = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.isVisible() && candidate.webContents.getURL().startsWith('http'),
    );
    const bitmap = (await shown?.webContents.capturePage())?.toBitmap() ?? Buffer.alloc(0);
    const seen = new Set<number>();
    for (let offset = 0; offset + 4 <= bitmap.length; offset += 4) {
      seen.add(bitmap.readUInt32LE(offset));
    }
    return seen.size;
  });
  expect(colors).toBeGreaterThan(1);
});
