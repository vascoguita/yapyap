import { describe, expect, it, vi } from 'vitest';
import { CONNECTIVITY_POLL_MS, RESUME_RECONNECT_MS, watchConnectivity } from './connectivity.ts';

function setup(states: boolean[]) {
  let tick: () => void = () => undefined;
  let resume: () => void = () => undefined;
  const isOnline = vi.fn(() => states.shift() ?? true);
  const deps = {
    isOnline,
    onResume: vi.fn((listener: () => void) => {
      resume = listener;
    }),
    every: vi.fn((callback: () => void) => {
      tick = callback;
    }),
    schedule: vi.fn(),
    onChange: vi.fn(),
    reconnect: vi.fn(),
  };
  watchConnectivity(deps);
  return {
    deps,
    tick: () => {
      tick();
    },
    resume: () => {
      resume();
    },
  };
}

describe('watchConnectivity', () => {
  it('polls for changes and shows the indicator only when the state changes', () => {
    const t = setup([true, true, false, false, true]);
    expect(t.deps.every).toHaveBeenCalledWith(expect.any(Function), CONNECTIVITY_POLL_MS);
    expect(t.deps.onChange).not.toHaveBeenCalled();
    t.tick();
    t.tick();
    t.tick();
    t.tick();
    expect(t.deps.onChange.mock.calls).toEqual([[false], [true]]);
  });

  it('reconnects when the network comes back, not when it goes away', () => {
    const t = setup([true, false, true]);
    t.tick();
    expect(t.deps.reconnect).not.toHaveBeenCalled();
    t.tick();
    expect(t.deps.reconnect).toHaveBeenCalledOnce();
  });

  it('shows the indicator right away when starting offline', () => {
    const t = setup([false]);
    expect(t.deps.onChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('reconnects shortly after the system wakes up', () => {
    const t = setup([true]);
    t.resume();
    expect(t.deps.schedule).toHaveBeenCalledExactlyOnceWith(t.deps.reconnect, RESUME_RECONNECT_MS);
  });
});
