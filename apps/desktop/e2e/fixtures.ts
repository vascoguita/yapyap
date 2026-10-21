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

/**
 * Starts the development build on a throwaway profile, so tests never touch
 * the developer's own settings or each other's.
 */
export function launchApp(
  origin: string,
  profile: string,
  args: readonly string[] = [],
): Promise<ElectronApplication> {
  return electron.launch({
    args: [MAIN, `--user-data-dir=${profile}`, ...args],
    // Playwright forces a light color scheme by default, which would hide YapYap's own theming.
    colorScheme: null,
    // Playwright adds --no-sandbox unless told otherwise, and YapYap refuses
    // to run without its sandbox; tests run with the real one.
    chromiumSandbox: true,
    env: appEnvironment(origin),
  });
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
    await app.close();
  },
  window: async ({ app }, use) => {
    await use(await app.firstWindow());
  },
});

export { expect } from '@playwright/test';
