/** This many GPU process crashes within a day start the next launch without acceleration. */
export const GPU_CRASH_LIMIT = 3;
export const GPU_CRASH_WINDOW_MS = 24 * 60 * 60_000;

/** Reads the crash log, which holds only timestamps; anything unreadable counts as empty. */
export function readGpuCrashes(read: () => string): number[] {
  try {
    const value: unknown = JSON.parse(read());
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === 'number')
      : [];
  } catch {
    return [];
  }
}

function recent(crashes: readonly number[], now: number): number[] {
  return crashes.filter((time) => now - time < GPU_CRASH_WINDOW_MS);
}

export function needsSafeGraphics(crashes: readonly number[], now: number): boolean {
  return recent(crashes, now).length >= GPU_CRASH_LIMIT;
}

/** The log after a new crash, dropping entries older than the window. */
export function withGpuCrash(crashes: readonly number[], now: number): number[] {
  return [...recent(crashes, now), now];
}

export interface GpuApp {
  disableHardwareAcceleration(): void;
  on(
    event: 'child-process-gone',
    listener: (event: unknown, details: { readonly type: string; readonly reason: string }) => void,
  ): unknown;
}

export interface GpuGuardDependencies {
  readonly readLog: () => string;
  readonly writeLog: (text: string) => void;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

/**
 * Must run before the app is ready: hardware acceleration can only be turned
 * off then. Records GPU process crashes for the next launch to read.
 */
export function guardGpu(app: GpuApp, deps: GpuGuardDependencies): void {
  if (needsSafeGraphics(readGpuCrashes(deps.readLog), deps.now())) {
    app.disableHardwareAcceleration();
    deps.warn('The GPU process crashed repeatedly; hardware acceleration is off for this run.');
  }
  app.on('child-process-gone', (_event, { type, reason }) => {
    if (type !== 'GPU' || reason === 'clean-exit') return;
    try {
      deps.writeLog(JSON.stringify(withGpuCrash(readGpuCrashes(deps.readLog), deps.now())));
    } catch {
      deps.warn('Could not record a GPU process crash.');
    }
  });
}
