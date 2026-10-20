import { describe, expect, it, vi } from 'vitest';
import {
  GPU_CRASH_LIMIT,
  GPU_CRASH_WINDOW_MS,
  chooseGraphics,
  describeGraphics,
  guardGpu,
  needsSafeGraphics,
  readGpuCrashes,
  withGpuCrash,
  type GpuApp,
} from './gpu-safe-mode.ts';

const DAY = GPU_CRASH_WINDOW_MS;

describe('limits', () => {
  it('allows three GPU crashes a day', () => {
    expect([GPU_CRASH_LIMIT, GPU_CRASH_WINDOW_MS]).toEqual([3, 86_400_000]);
  });
});

describe('readGpuCrashes', () => {
  it('reads the timestamps and drops anything else', () => {
    expect(readGpuCrashes(() => '[1, "x", 2, null]')).toEqual([1, 2]);
  });

  it.each(['{}', 'null', 'not json'])('treats %j as empty', (text) => {
    expect(readGpuCrashes(() => text)).toEqual([]);
  });

  it('treats a missing log as empty', () => {
    expect(
      readGpuCrashes(() => {
        throw new Error('ENOENT');
      }),
    ).toEqual([]);
  });
});

describe('needsSafeGraphics', () => {
  it('needs safe graphics after enough recent crashes', () => {
    const now = 10 * DAY;
    const recent = Array.from({ length: GPU_CRASH_LIMIT }, (_, i) => now - i);
    expect(needsSafeGraphics(recent, now)).toBe(true);
    expect(needsSafeGraphics(recent.slice(1), now)).toBe(false);
    expect(needsSafeGraphics([now - DAY, ...recent.slice(1)], now)).toBe(false);
  });
});

describe('withGpuCrash', () => {
  it('adds the crash and drops entries older than the window', () => {
    expect(withGpuCrash([1, 5 * DAY], 5 * DAY + 10)).toEqual([5 * DAY, 5 * DAY + 10]);
  });
});

const ALL_ON = { hardwareAcceleration: true, hardwareVideoDecoding: true };
const MANY = [3 * DAY - 3, 3 * DAY - 2, 3 * DAY - 1];

describe('chooseGraphics', () => {
  it('uses the hardware fully by default', () => {
    expect(chooseGraphics(ALL_ON, false, [], 3 * DAY)).toEqual({
      acceleration: true,
      videoDecoding: true,
      reason: undefined,
    });
  });

  it('follows the settings', () => {
    expect(chooseGraphics({ ...ALL_ON, hardwareVideoDecoding: false }, false, [], 0)).toEqual({
      acceleration: true,
      videoDecoding: false,
      reason: 'settings',
    });
    expect(chooseGraphics({ ...ALL_ON, hardwareAcceleration: false }, false, [], 0)).toEqual({
      acceleration: false,
      videoDecoding: false,
      reason: 'settings',
    });
  });

  it('lets repeated GPU crashes override the settings, and safe mode override both', () => {
    const off = { acceleration: false, videoDecoding: false };
    expect(chooseGraphics(ALL_ON, false, MANY, 3 * DAY)).toEqual({ ...off, reason: 'gpu-crashes' });
    expect(chooseGraphics(ALL_ON, true, MANY, 3 * DAY)).toEqual({ ...off, reason: 'safe-mode' });
    expect(chooseGraphics(ALL_ON, true, [], 3 * DAY)).toEqual({ ...off, reason: 'safe-mode' });
  });
});

describe('describeGraphics', () => {
  it.each([
    [ALL_ON, false, [], 'hardware accelerated'],
    [
      { ...ALL_ON, hardwareVideoDecoding: false },
      false,
      [],
      'hardware accelerated, software video decoding',
    ],
    [
      { ...ALL_ON, hardwareAcceleration: false },
      false,
      [],
      'software rendering (turned off in settings)',
    ],
    [ALL_ON, false, MANY, 'software rendering (after repeated GPU crashes)'],
    [ALL_ON, true, [], 'software rendering (safe mode)'],
  ] as const)(
    'describes %j, safe mode %j, crashes %j as %j',
    (preferences, safeMode, crashes, text) => {
      expect(describeGraphics(chooseGraphics(preferences, safeMode, crashes, 3 * DAY))).toBe(text);
    },
  );
});

describe('guardGpu', () => {
  function setup(log: string, preferences = ALL_ON) {
    let gone: Parameters<GpuApp['on']>[1] = () => undefined;
    const app = {
      disableHardwareAcceleration: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      on: vi.fn((_event: 'child-process-gone', listener: typeof gone) => {
        gone = listener;
      }),
    } satisfies GpuApp;
    const deps = {
      preferences,
      safeMode: false,
      readLog: () => log,
      writeLog: vi.fn(),
      now: () => 3 * DAY,
      warn: vi.fn(),
    };
    const graphics = guardGpu(app, deps);
    return {
      app,
      deps,
      graphics,
      gone: (type: string, reason: string) => {
        gone({}, { type, reason });
      },
    };
  }

  it('starts without acceleration after repeated GPU crashes', () => {
    const t = setup(JSON.stringify(MANY));
    expect(t.graphics.reason).toBe('gpu-crashes');
    expect(t.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(t.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'disable-accelerated-video-decode',
    );
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'The GPU process crashed repeatedly; hardware acceleration is off for this run.',
    );
  });

  it('keeps acceleration otherwise and records GPU crashes only', () => {
    const t = setup('[]');
    expect(t.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(t.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(t.app.on).toHaveBeenCalledWith('child-process-gone', expect.any(Function));
    t.gone('Utility', 'crashed');
    t.gone('GPU', 'clean-exit');
    t.gone('GPU', 'crashed');
    expect(t.deps.writeLog.mock.calls).toEqual([[JSON.stringify([3 * DAY])]]);
  });

  it('turns off only hardware video decoding when the settings say so, quietly', () => {
    const t = setup('[]', { ...ALL_ON, hardwareVideoDecoding: false });
    expect(t.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(t.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'disable-accelerated-video-decode',
    );
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('logs a crash it could not record', () => {
    const t = setup('[]');
    t.deps.writeLog.mockImplementationOnce(() => {
      throw new Error('EROFS');
    });
    t.gone('GPU', 'crashed');
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not record a GPU process crash.');
  });
});
