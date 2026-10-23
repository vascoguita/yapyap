import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

test('passes the disk cache and memory limits to Chromium at launch', async ({
  fakeWhatsApp,
  profile,
}) => {
  await writeFile(
    join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 13, reliability: { diskCacheMb: '256', jsHeapMb: '4096' } }),
  );
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    const switches = await app.evaluate(({ app: electronApp }) => ({
      cache: electronApp.commandLine.getSwitchValue('disk-cache-size'),
      heap: electronApp.commandLine.getSwitchValue('js-flags'),
    }));
    expect(switches).toEqual({
      cache: String(256 * 1024 * 1024),
      heap: '--max-old-space-size=4096',
    });
  } finally {
    await closeApp(app);
  }
});
