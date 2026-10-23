import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { launchApp, whatsAppPage } from '../fixtures.ts';

export interface Sample {
  /** From starting the process to WhatsApp's page being visible. */
  readonly coldStartMs: number;
  /** All of YapYap's processes together, after it has settled. */
  readonly idleMemoryMb: number;
}

/** Long enough for start-up work to finish and memory to settle. */
const SETTLE_MS = 10_000;

async function idleMemoryMb(app: ElectronApplication): Promise<number> {
  const kilobytes = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0),
  );
  return Math.round(kilobytes / 1024);
}

/** One cold start on a fresh profile, as a first launch after install. */
export async function measureOnce(): Promise<Sample> {
  const fake = await startFakeWhatsApp();
  const profile = await mkdtemp(join(tmpdir(), 'yapyap-bench-'));
  const started = performance.now();
  const app = await launchApp(fake.origin, profile);
  try {
    const window = await whatsAppPage(app);
    await window.getByTestId('fake-whatsapp').waitFor({ state: 'visible' });
    const coldStartMs = Math.round(performance.now() - started);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    return { coldStartMs, idleMemoryMb: await idleMemoryMb(app) };
  } finally {
    await app.close();
    await fake.close();
    await rm(profile, { recursive: true, force: true });
  }
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
