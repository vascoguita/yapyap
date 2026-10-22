import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appEnvironment } from './app-environment.ts';
import { startFakeWhatsApp, type FakeWhatsApp } from './fake-whatsapp-server.ts';

const MAIN = join(import.meta.dirname, '..', 'out', 'main', 'index.js');

interface Options {
  /** The fake WhatsApp page served at `/`. */
  fakePage: string;
}

/** How long a quit may take before the test reports what kept YapYap open (#223). */
const QUIT_TIMEOUT_MS = 30_000;
const LOG_LINES = 40;
const LOGS = new WeakMap<ElectronApplication, string[]>();

/** The app's last log lines; the logger mirrors every line to stderr, already redacted. */
function recentLog(app: ElectronApplication): string[] {
  const lines: string[] = [];
  app.process().stderr?.on('data', (chunk: Buffer) => {
    lines.push(
      ...chunk
        .toString()
        .split('\n')
        .filter((line) => line !== ''),
    );
    lines.splice(0, Math.max(0, lines.length - LOG_LINES));
  });
  return lines;
}

/**
 * Quits the app, and if it hangs, kills it and fails with the windows it had
 * and its last log lines rather than an unexplained teardown timeout (#223).
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const log = LOGS.get(app) ?? [];
  const windows = await app
    .evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map(
        (window) => `${window.webContents.getURL()} visible=${String(window.isVisible())}`,
      ),
    )
    .catch(() => ['(could not list windows)']);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, QUIT_TIMEOUT_MS);
  });
  const result = await Promise.race([app.close().then(() => 'closed' as const), timedOut]);
  clearTimeout(timer);
  if (result === 'timeout') {
    app.process().kill('SIGKILL');
    throw new Error(
      [
        `YapYap did not quit within ${String(QUIT_TIMEOUT_MS / 1000)} s (#223).`,
        'Windows before closing:',
        ...windows,
        'Last log lines:',
        ...log,
      ].join('\n'),
    );
  }
}

/**
 * Starts the development build on a throwaway profile, so tests never touch
 * the developer's own settings or each other's.
 */
export async function launchApp(
  origin: string,
  profile: string,
  args: readonly string[] = [],
): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${profile}`, ...args],
    // Playwright forces a light color scheme by default, which would hide YapYap's own theming.
    colorScheme: null,
    // Playwright adds --no-sandbox unless told otherwise, and YapYap refuses
    // to run without its sandbox; tests run with the real one.
    chromiumSandbox: true,
    env: appEnvironment(origin),
  });
  LOGS.set(app, recentLog(app));
  return app;
}

/**
 * Starts YapYap again on `profile` while the app under test runs there, as a
 * user or the OS would, and resolves with how it ended once it hands over.
 */
/** Starts the development build as its own process, outside Playwright's control. */
export async function spawnApp(
  origin: string,
  profile: string,
  args: readonly string[],
): Promise<ChildProcessByStdio<null, null, Readable>> {
  const { default: executable } = (await import('electron')) as unknown as { default: string };
  return spawn(executable, [MAIN, `--user-data-dir=${profile}`, ...args], {
    env: appEnvironment(origin),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

export async function launchAgain(
  origin: string,
  profile: string,
  args: readonly string[],
): Promise<{ code: number | null; signal: string | null; stderr: string }> {
  const second = await spawnApp(origin, profile, args);
  let stderr = '';
  second.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return new Promise((resolve) => {
    second.once('exit', (code, signal) => {
      resolve({ code, signal, stderr });
    });
  });
}

interface Fixtures {
  /** The app's user data folder, where settings are saved. */
  profile: string;
  fakeWhatsApp: FakeWhatsApp;
  app: ElectronApplication;
  window: Page;
}

export const test = base.extend<Fixtures & Options>({
  fakePage: ['index.html', { option: true }],
  fakeWhatsApp: async ({ fakePage }, use) => {
    const server = await startFakeWhatsApp(fakePage);
    await use(server);
    await server.close();
  },
  profile: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'yapyap-e2e-'));
    await use(profile);
    await rm(profile, { recursive: true, force: true });
  },
  app: async ({ fakeWhatsApp, profile }, use) => {
    const app = await launchApp(fakeWhatsApp.origin, profile);
    await use(app);
    await closeApp(app);
  },
  window: async ({ app }, use) => {
    await use(await app.firstWindow());
  },
});

export { expect } from '@playwright/test';
