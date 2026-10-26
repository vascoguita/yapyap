import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_WITHIN_S,
  HARD_LIMIT_FACTOR,
  MEMORY_SAMPLE_MS,
  SAMPLES_OVER_LIMIT,
  watchMemory,
} from './memory-watchdog.ts';

function setup(options: { focused?: boolean; idle?: number } = {}) {
  let sample: (() => void) | undefined;
  let usedMb = 100;
  let destroyed: (() => void) | undefined;
  const renderer = {
    getOSProcessId: () => 42,
    reload: vi.fn(),
    once: vi.fn((_event: 'destroyed', listener: () => void) => {
      destroyed = listener;
    }),
  };
  const deps = {
    metrics: vi.fn(() => [
      { pid: 7, memory: { workingSetSize: 9_999_999 } },
      { pid: 42, memory: { workingSetSize: usedMb * 1024 } },
    ]),
    limitMb: vi.fn(() => 2048),
    focused: () => options.focused ?? false,
    idleSeconds: () => options.idle ?? 600,
    every: vi.fn((callback: () => void) => {
      sample = callback;
      return 'timer';
    }),
    stop: vi.fn(),
    warn: vi.fn(),
  };
  watchMemory(renderer, deps);
  const at = (mb: number, times = 1): void => {
    usedMb = mb;
    for (let index = 0; index < times; index += 1) {
      sample?.();
    }
  };
  return { renderer, deps, at, destroy: () => destroyed?.() };
}

describe('watchMemory', () => {
  it('stops sampling once the renderer is destroyed, as when its account is removed', () => {
    const t = setup();
    expect(t.deps.stop).not.toHaveBeenCalled();
    t.destroy();
    expect(t.renderer.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    expect(t.deps.stop).toHaveBeenCalledExactlyOnceWith('timer');
  });

  it('samples once a minute', () => {
    const t = setup();
    expect(t.deps.every).toHaveBeenCalledExactlyOnceWith(expect.any(Function), MEMORY_SAMPLE_MS);
    expect([MEMORY_SAMPLE_MS, SAMPLES_OVER_LIMIT, ACTIVE_WITHIN_S, HARD_LIMIT_FACTOR]).toEqual([
      60_000, 2, 60, 1.5,
    ]);
  });

  it('reloads after two samples in a row over the limit, logging only sizes', () => {
    const t = setup();
    t.at(2049);
    expect(t.renderer.reload).not.toHaveBeenCalled();
    t.at(2300);
    expect(t.renderer.reload).toHaveBeenCalledOnce();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'The WhatsApp renderer used 2300 MB, over the 2048 MB limit; reloading it.',
    );
  });

  it('starts counting again after a sample at or under the limit, and after a reload', () => {
    const t = setup();
    t.at(3000);
    t.at(2048);
    t.at(3000);
    expect(t.renderer.reload).not.toHaveBeenCalled();
    t.at(3000);
    expect(t.renderer.reload).toHaveBeenCalledOnce();
    t.at(3000);
    expect(t.renderer.reload).toHaveBeenCalledOnce();
  });

  it('follows a limit changed in settings', () => {
    const t = setup();
    t.deps.limitMb.mockReturnValue(4096);
    t.at(3000, 3);
    expect(t.renderer.reload).not.toHaveBeenCalled();
  });

  it('waits while the user is busy in the window', () => {
    const t = setup({ focused: true, idle: ACTIVE_WITHIN_S - 1 });
    t.at(3071, 5);
    expect(t.renderer.reload).not.toHaveBeenCalled();
  });

  it('reloads even while busy once past one and a half times the limit', () => {
    const t = setup({ focused: true, idle: 0 });
    t.at(3072, 2);
    expect(t.renderer.reload).toHaveBeenCalledOnce();
  });

  it.each([
    { focused: true, idle: ACTIVE_WITHIN_S },
    { focused: false, idle: 0 },
  ])('treats %j as not busy', (options) => {
    const t = setup(options);
    t.at(2100, 2);
    expect(t.renderer.reload).toHaveBeenCalledOnce();
  });

  it('does nothing while the renderer has no process', () => {
    const t = setup();
    t.deps.metrics.mockReturnValue([]);
    t.at(9000, 3);
    expect(t.renderer.reload).not.toHaveBeenCalled();
  });
});
