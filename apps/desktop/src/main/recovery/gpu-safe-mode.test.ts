import { describe, expect, it, vi } from 'vitest';
import {
  GPU_CRASH_LIMIT,
  GPU_CRASH_WINDOW_MS,
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

describe('guardGpu', () => {
  function setup(log: string) {
    let gone: Parameters<GpuApp['on']>[1] = () => undefined;
    const app = {
      disableHardwareAcceleration: vi.fn(),
      on: vi.fn((_event: 'child-process-gone', listener: typeof gone) => {
        gone = listener;
      }),
    } satisfies GpuApp;
    const deps = { readLog: () => log, writeLog: vi.fn(), now: () => 3 * DAY, warn: vi.fn() };
    guardGpu(app, deps);
    return {
      app,
      deps,
      gone: (type: string, reason: string) => {
        gone({}, { type, reason });
      },
    };
  }

  it('starts without acceleration after repeated GPU crashes', () => {
    const t = setup(JSON.stringify([3 * DAY - 3, 3 * DAY - 2, 3 * DAY - 1]));
    expect(t.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'The GPU process crashed repeatedly; hardware acceleration is off for this run.',
    );
  });

  it('keeps acceleration otherwise and records GPU crashes only', () => {
    const t = setup('[]');
    expect(t.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(t.app.on).toHaveBeenCalledWith('child-process-gone', expect.any(Function));
    t.gone('Utility', 'crashed');
    t.gone('GPU', 'clean-exit');
    t.gone('GPU', 'crashed');
    expect(t.deps.writeLog.mock.calls).toEqual([[JSON.stringify([3 * DAY])]]);
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
