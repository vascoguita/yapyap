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

/** Why YapYap runs with less than full hardware acceleration. */
export type GraphicsReason = 'safe-mode' | 'gpu-crashes' | 'settings';

export interface Graphics {
  readonly acceleration: boolean;
  readonly videoDecoding: boolean;
  readonly reason: GraphicsReason | undefined;
}

export interface GraphicsPreferences {
  readonly hardwareAcceleration: boolean;
  readonly hardwareVideoDecoding: boolean;
}

/** Safe mode wins over the crash fallback, which wins over the settings. */
export function chooseGraphics(
  preferences: GraphicsPreferences,
  safeMode: boolean,
  crashes: readonly number[],
  now: number,
): Graphics {
  if (safeMode) {
    return { acceleration: false, videoDecoding: false, reason: 'safe-mode' };
  }
  if (needsSafeGraphics(crashes, now)) {
    return { acceleration: false, videoDecoding: false, reason: 'gpu-crashes' };
  }
  const acceleration = preferences.hardwareAcceleration;
  const videoDecoding = acceleration && preferences.hardwareVideoDecoding;
  return { acceleration, videoDecoding, reason: videoDecoding ? undefined : 'settings' };
}

const SOFTWARE_BECAUSE: Readonly<Record<GraphicsReason, string>> = {
  'safe-mode': 'software rendering (safe mode)',
  'gpu-crashes': 'software rendering (after repeated GPU crashes)',
  settings: 'software rendering (turned off in settings)',
};

/** One line for diagnostics. */
export function describeGraphics(graphics: Graphics): string {
  if (graphics.reason === undefined) {
    return 'hardware accelerated';
  }
  if (graphics.acceleration) {
    return 'hardware accelerated, software video decoding';
  }
  return SOFTWARE_BECAUSE[graphics.reason];
}

export interface GpuApp {
  disableHardwareAcceleration(): void;
  readonly commandLine: { appendSwitch(name: string): void };
  on(
    event: 'child-process-gone',
    listener: (event: unknown, details: { readonly type: string; readonly reason: string }) => void,
  ): unknown;
}

export interface GpuGuardDependencies {
  readonly preferences: GraphicsPreferences;
  /** Started with `--safe-mode`. */
  readonly safeMode: boolean;
  readonly readLog: () => string;
  readonly writeLog: (text: string) => void;
  readonly now: () => number;
  readonly warn: (message: string) => void;
}

/**
 * Must run before the app is ready: hardware acceleration can only be turned
 * off then. Records GPU process crashes for the next launch to read.
 */
export function guardGpu(app: GpuApp, deps: GpuGuardDependencies): Graphics {
  const graphics = chooseGraphics(
    deps.preferences,
    deps.safeMode,
    readGpuCrashes(deps.readLog),
    deps.now(),
  );
  if (!graphics.acceleration) {
    app.disableHardwareAcceleration();
  }
  if (!graphics.videoDecoding) {
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
  }
  if (graphics.reason === 'gpu-crashes') {
    deps.warn('The GPU process crashed repeatedly; hardware acceleration is off for this run.');
  }
  app.on('child-process-gone', (_event, { type, reason }) => {
    if (type !== 'GPU' || reason === 'clean-exit') {
      return;
    }
    try {
      deps.writeLog(JSON.stringify(withGpuCrash(readGpuCrashes(deps.readLog), deps.now())));
    } catch {
      deps.warn('Could not record a GPU process crash.');
    }
  });
  return graphics;
}
