import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, launchApp, test } from './fixtures.ts';

test('saves a local crash report after an unclean exit, and clears the mark on quit', async ({
  fakeWhatsApp,
  profile,
}) => {
  await writeFile(
    join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 1, privacy: { crashReports: 'local' } }),
  );
  // What a session that never quit cleanly leaves behind.
  await writeFile(
    join(profile, 'running.json'),
    JSON.stringify({ version: '0.0.9', startedAt: Date.now() - 60_000 }),
  );
  await mkdir(join(profile, 'logs'));
  await writeFile(join(profile, 'logs', 'yapyap.log'), 'warn The last thing that happened\n');
  const app = await launchApp(fakeWhatsApp.origin, profile);
  const report = join(profile, 'crash-report.txt');
  await expect
    .poll(() => readFile(report, 'utf8').catch(() => ''))
    .toMatch(
      /^YapYap closed unexpectedly\.\nPrevious session: YapYap 0\.0\.9,[\s\S]*\nwarn The last thing that happened$/,
    );
  expect(existsSync(join(profile, 'running.json'))).toBe(true);
  await expect((await app.firstWindow()).getByTestId('fake-whatsapp')).toBeVisible();
  // Quit as a user does; Playwright's own close skips Electron's quit events.
  const closed = app.waitForEvent('close');
  // The app exits before it can answer, so the evaluation itself fails.
  await app
    .evaluate(({ app: electronApp }) => {
      electronApp.quit();
    })
    .catch(() => undefined);
  await closed;
  // Playwright reports the close when its connection drops, a moment before the process ends.
  await expect.poll(() => existsSync(join(profile, 'running.json'))).toBe(false);
});
