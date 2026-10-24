import { describe, expect, it, vi } from 'vitest';
import {
  CPU_LIMIT_PERCENT,
  guardPluginResources,
  MEMORY_LIMIT_MB,
  PLUGIN_SAMPLE_MS,
  RESTART_WINDOW_MS,
  type ProcessMetrics,
} from './resource-guard.ts';

const HELLO = { id: 'org.example.hello', name: 'Hello', pid: 41 };
const OTHER = { id: 'org.example.other', name: 'Other', pid: 42 };

const sample = (pid: number, cpu: number, memoryMb: number): ProcessMetrics => ({
  pid,
  cpu: { percentCPUUsage: cpu },
  memory: { workingSetSize: memoryMb * 1024 },
});

function setup() {
  let tick: (() => void) | undefined;
  let metrics: ProcessMetrics[] = [];
  let time = 0;
  const deps = {
    metrics: () => metrics,
    running: vi.fn(() => [HELLO, OTHER]),
    restart: vi.fn(),
    stop: vi.fn(),
    notify: vi.fn(),
    every: vi.fn<(callback: () => void, ms: number) => void>((callback) => {
      tick = callback;
    }),
    now: () => time,
    warn: vi.fn(),
  };
  guardPluginResources(deps);
  return {
    deps,
    measure: (next: ProcessMetrics[], times = 1) => {
      metrics = next;
      for (let index = 0; index < times; index += 1) {
        tick?.();
      }
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('guardPluginResources', () => {
  it('samples every few seconds and forgives a short spike', () => {
    const t = setup();
    expect(t.deps.every).toHaveBeenCalledWith(expect.any(Function), PLUGIN_SAMPLE_MS);
    const busy = [sample(41, CPU_LIMIT_PERCENT + 1, 10), sample(42, 1, 10)];
    t.measure(busy, 2);
    t.measure([sample(41, 1, 10)]);
    t.measure(busy, 2);
    expect(t.deps.restart).not.toHaveBeenCalled();
  });

  it('restarts a plugin that stays over its CPU or memory limit', () => {
    const t = setup();
    t.measure([sample(41, CPU_LIMIT_PERCENT + 1, 10)], 3);
    expect(t.deps.restart).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(t.deps.warn).toHaveBeenLastCalledWith(
      'Plugin org.example.hello went over its CPU limit and was restarted.',
    );
    t.measure([sample(42, 1, MEMORY_LIMIT_MB + 1)], 3);
    expect(t.deps.restart).toHaveBeenLastCalledWith('org.example.other');
    expect(t.deps.warn).toHaveBeenLastCalledWith(
      'Plugin org.example.other went over its memory limit and was restarted.',
    );
    // At the limit is within it.
    t.measure([sample(41, CPU_LIMIT_PERCENT, MEMORY_LIMIT_MB)], 6);
    expect(t.deps.restart).toHaveBeenCalledTimes(2);
  });

  it('stops a plugin restarted too often, tells the user, and counts afresh later', () => {
    const t = setup();
    const busy = [sample(41, CPU_LIMIT_PERCENT + 1, 10)];
    t.measure(busy, 6);
    expect(t.deps.restart).toHaveBeenCalledTimes(2);
    t.measure(busy, 3);
    expect(t.deps.stop).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(t.deps.restart).toHaveBeenCalledTimes(2);
    expect(t.deps.notify).toHaveBeenCalledExactlyOnceWith(
      'Hello kept using too much of your computer, so YapYap stopped it. Install it again to start it.',
    );
    expect(t.deps.warn).toHaveBeenLastCalledWith(
      'Plugin org.example.hello kept going over its CPU limit and was stopped.',
    );
    // Restarts long apart never add up to a stop.
    for (let round = 0; round < 3; round += 1) {
      t.advance(RESTART_WINDOW_MS);
      t.measure(busy, 3);
    }
    expect(t.deps.stop).toHaveBeenCalledOnce();
    expect(t.deps.restart).toHaveBeenCalledTimes(5);
  });

  it('leaves alone a plugin whose process it cannot find', () => {
    const t = setup();
    t.measure([sample(99, 100, 1000)], 5);
    expect(t.deps.restart).not.toHaveBeenCalled();
  });
});
