import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackVisibility } from './visibility.ts';

function setup(visible: boolean, minimized = false) {
  const listeners = new Map<string, () => void>();
  const window = {
    isVisible: vi.fn(() => visible),
    isMinimized: vi.fn(() => minimized),
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
  };
  const onChange = vi.fn();
  return {
    window,
    onChange,
    visibility: trackVisibility(window, onChange),
    fire: (event: string) => listeners.get(event)?.(),
  };
}

const state = (t: ReturnType<typeof setup>) => [t.visibility.visible(), t.visibility.onScreen()];

describe('trackVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the window, even when it appeared without a show event', () => {
    const t = setup(false);
    expect(state(t)).toEqual([false, false]);
    t.window.isVisible.mockReturnValue(true);
    expect(state(t)).toEqual([true, true]);
    t.window.isMinimized.mockReturnValue(true);
    expect(state(t)).toEqual([true, false]);
  });

  it('trusts hide and minimize over a window that still reports the old state', () => {
    const t = setup(true);
    t.fire('minimize');
    expect(state(t)).toEqual([true, false]);
    t.fire('restore');
    expect(state(t)).toEqual([true, true]);
    t.fire('hide');
    expect(state(t)).toEqual([false, false]);
    t.fire('show');
    expect(state(t)).toEqual([true, true]);
    t.fire('hide');
    t.fire('minimize');
    t.fire('focus');
    expect(state(t)).toEqual([true, true]);
    expect(t.onChange).toHaveBeenCalledTimes(7);
  });

  it('looks again once the window has settled, in case an event came out of order', () => {
    const t = setup(true);
    t.fire('focus');
    expect(t.onChange).toHaveBeenCalledOnce();
    t.window.isVisible.mockReturnValue(false);
    vi.advanceTimersByTime(250);
    expect(t.onChange).toHaveBeenCalledTimes(2);
    expect(state(t)).toEqual([false, false]);
  });
});
