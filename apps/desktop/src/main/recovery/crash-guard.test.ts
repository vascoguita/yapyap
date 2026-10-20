import { describe, expect, it, vi } from 'vitest';
import {
  guardCrashes,
  MAX_RELOADS,
  RELOAD_WINDOW_MS,
  UNRESPONSIVE_GRACE_MS,
  type CrashableContents,
} from './crash-guard.ts';

type Listener = (...args: never[]) => void;

function setup() {
  const handlers = new Map<string, Listener>();
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      handlers.set(event, listener);
    }),
    reload: vi.fn(),
    forcefullyCrashRenderer: vi.fn(),
  } satisfies CrashableContents;
  let clock = 10 * RELOAD_WINDOW_MS;
  const scheduled: { callback: () => void; ms: number }[] = [];
  const deps = {
    now: () => clock,
    schedule: vi.fn((callback: () => void, ms: number) => scheduled.push({ callback, ms })),
    notify: vi.fn(),
    showFailure: vi.fn(),
    warn: vi.fn(),
  };
  guardCrashes(contents, deps);
  const fire = (event: string, ...args: unknown[]): void => {
    handlers.get(event)?.(...(args as never[]));
  };
  const crash = (reason = 'crashed'): void => {
    fire('render-process-gone', {}, { reason });
  };
  return { contents, deps, scheduled, fire, crash, advance: (ms: number) => (clock += ms) };
}

describe('guardCrashes', () => {
  it('allows three reloads in five minutes and a 30-second grace for hangs', () => {
    expect([MAX_RELOADS, RELOAD_WINDOW_MS, UNRESPONSIVE_GRACE_MS]).toEqual([3, 300_000, 30_000]);
  });

  it('reloads a crashed renderer and tells the user, logging only the reason', () => {
    const t = setup();
    t.crash('oom');
    expect(t.contents.reload).toHaveBeenCalledOnce();
    expect(t.deps.notify).toHaveBeenCalledExactlyOnceWith(
      'WhatsApp stopped unexpectedly and was reloaded.',
    );
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('The WhatsApp renderer ended (oom).');
  });

  it('ignores a renderer that exited cleanly', () => {
    const t = setup();
    t.crash('clean-exit');
    expect(t.contents.reload).not.toHaveBeenCalled();
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('stops reloading during a crash loop and shows the recovery screen', () => {
    const t = setup();
    for (let i = 0; i < MAX_RELOADS; i++) t.crash();
    expect(t.contents.reload).toHaveBeenCalledTimes(MAX_RELOADS);
    t.crash();
    expect(t.contents.reload).toHaveBeenCalledTimes(MAX_RELOADS);
    expect(t.deps.showFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'crashed' });
  });

  it('forgets crashes older than the window', () => {
    const t = setup();
    for (let i = 0; i < MAX_RELOADS; i++) t.crash();
    t.advance(RELOAD_WINDOW_MS);
    t.crash();
    expect(t.contents.reload).toHaveBeenCalledTimes(MAX_RELOADS + 1);
    expect(t.deps.showFailure).not.toHaveBeenCalled();
  });

  it('restarts a renderer that stays unresponsive past the grace period', () => {
    const t = setup();
    t.fire('unresponsive');
    expect(t.scheduled.map(({ ms }) => ms)).toEqual([UNRESPONSIVE_GRACE_MS]);
    t.scheduled[0]?.callback();
    expect(t.contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();
  });

  it('leaves a renderer that recovers on its own alone', () => {
    const t = setup();
    t.fire('unresponsive');
    t.fire('responsive');
    t.scheduled[0]?.callback();
    expect(t.contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    expect(t.contents.on).toHaveBeenCalledWith('responsive', expect.any(Function));
  });

  it('never restarts for a hang that ended, even after a new one starts', () => {
    const t = setup();
    t.fire('unresponsive');
    t.fire('responsive');
    t.fire('unresponsive');
    t.scheduled[0]?.callback();
    expect(t.contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    t.scheduled[1]?.callback();
    expect(t.contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();
  });

  it('restarts only for the latest hang', () => {
    const t = setup();
    t.fire('unresponsive');
    t.fire('unresponsive');
    t.scheduled[0]?.callback();
    expect(t.contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    t.scheduled[1]?.callback();
    expect(t.contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();
  });

  it('ignores responsive events without a pending hang', () => {
    const t = setup();
    t.fire('responsive');
    expect(t.deps.schedule).not.toHaveBeenCalled();
  });
});
