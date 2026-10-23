import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test } from './fixtures.ts';

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
    const page = await first.firstWindow();
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
    const page = await second.firstWindow();
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
