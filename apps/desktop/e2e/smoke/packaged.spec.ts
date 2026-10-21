import { chromium, expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appEnvironment } from '../app-environment.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';

const executable = process.env['YAPYAP_PACKAGED_EXECUTABLE'] ?? '';
// Set where the package cannot get its sandbox (an AppImage on a system that
// restricts user namespaces), so the explanation is what should appear.
const expectUnsafeStart = process.env['YAPYAP_EXPECT_UNSAFE_START'] === '1';

function readEndpoint(file: string): string {
  try {
    const [port = '', path = ''] = readFileSync(file, 'utf8').split('\n');
    return port !== '' && path !== '' ? `ws://127.0.0.1:${port}${path}` : '';
  } catch {
    // Missing until Chromium starts, and on Windows locked (EBUSY) while it is
    // being written, so a failed read just means "not yet".
    return '';
  }
}

// Packaged builds disable the Node inspector fuse, so Playwright's Electron
// launcher cannot attach. Chromium still writes its DevTools endpoint to the
// profile directory, which works even when a launcher (the Windows portable
// build) hides the app's own output.
async function devToolsEndpoint(app: ChildProcess, profile: string): Promise<string> {
  const file = join(profile, 'DevToolsActivePort');
  await expect
    .poll(
      () =>
        app.exitCode === null ? readEndpoint(file) : Promise.reject(new Error('App exited early')),
      { timeout: 60_000 },
    )
    .toMatch(/^ws:\/\//);
  return readEndpoint(file);
}

test('the installed package opens a window on the fake WhatsApp page', async () => {
  test.setTimeout(120_000);
  test.skip(executable === '', 'Set YAPYAP_PACKAGED_EXECUTABLE to an installed YapYap executable.');
  test.skip(expectUnsafeStart, 'This system cannot give the package its sandbox.');
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

test('the package explains, instead of running, when it cannot get its sandbox', async () => {
  test.skip(!expectUnsafeStart, 'Only where the sandbox is unavailable.');
  test.skip(executable === '', 'Set YAPYAP_PACKAGED_EXECUTABLE to an installed YapYap executable.');
  const fake = await startFakeWhatsApp();
  const profile = mkdtempSync(join(tmpdir(), 'yapyap-smoke-'));
  const app = spawn(executable, [`--user-data-dir=${profile}`], {
    env: appEnvironment(fake.origin),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    let stderr = '';
    app.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    await expect.poll(() => stderr, { timeout: 60_000 }).toContain('YapYap cannot start safely');
  } finally {
    app.kill();
    await fake.close();
  }
});
