import { expect, spawnApp, test } from './fixtures.ts';

test('explains instead of running when the sandbox is turned off', async ({
  fakeWhatsApp,
  profile,
}) => {
  const app = await spawnApp(fakeWhatsApp.origin, profile, ['--no-sandbox']);
  try {
    let stderr = '';
    app.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    // The app waits on its explanation dialog, so the message is what to look for.
    await expect.poll(() => stderr, { timeout: 30_000 }).toContain('YapYap cannot start safely');
    expect(stderr).not.toContain('fake-whatsapp');
    expect(app.exitCode).toBeNull();
  } finally {
    app.kill();
  }
});
