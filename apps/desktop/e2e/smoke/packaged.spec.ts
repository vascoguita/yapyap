import { chromium, expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appEnvironment } from '../app-environment.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';

const executable = process.env['YAPYAP_PACKAGED_EXECUTABLE'] ?? '';

// Packaged builds disable the Node inspector fuse, so Playwright's Electron
// launcher cannot attach. Chromium still writes its DevTools endpoint to the
// profile directory, which works even when a launcher (the Windows portable
// build) hides the app's own output.
async function devToolsEndpoint(app: ChildProcess, profile: string): Promise<string> {
  const file = join(profile, 'DevToolsActivePort');
  await expect
    .poll(
      () =>
        app.exitCode === null ? existsSync(file) : Promise.reject(new Error('App exited early')),
      {
        timeout: 60_000,
      },
    )
    .toBe(true);
  const [port, path] = readFileSync(file, 'utf8').split('\n');
  return `ws://127.0.0.1:${String(port)}${String(path)}`;
}

test('the installed package opens a window on the fake WhatsApp page', async () => {
  test.setTimeout(120_000);
  test.skip(executable === '', 'Set YAPYAP_PACKAGED_EXECUTABLE to an installed YapYap executable.');
  const fake = await startFakeWhatsApp();
  const profile = mkdtempSync(join(tmpdir(), 'yapyap-smoke-'));
  const app = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${profile}`], {
    env: appEnvironment(fake.origin),
    stdio: 'inherit',
  });
  try {
    const browser = await chromium.connectOverCDP(await devToolsEndpoint(app, profile));
    await expect
      .poll(
        () =>
          browser
            .contexts()
            .flatMap((context) => context.pages())
            .map((page) => new URL(page.url()).origin),
        {
          timeout: 30_000,
        },
      )
      .toContain(fake.origin);
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith(fake.origin));
    if (page === undefined) throw new Error('No page loaded the fake WhatsApp origin');
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await browser.close();
  } finally {
    app.kill();
    await fake.close();
  }
});
