import { describe, expect, it, vi } from 'vitest';
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

describe('trackVisibility', () => {
  it('starts from what the window reports', () => {
    expect(setup(true).visibility.onScreen()).toBe(true);
    expect(setup(true, true).visibility.onScreen()).toBe(false);
    expect(setup(true, true).visibility.visible()).toBe(true);
    expect(setup(false).visibility.visible()).toBe(false);
  });

  it('follows the events, even while the window still reports the old state', () => {
    const t = setup(false);
    t.fire('show');
    expect(t.visibility.onScreen()).toBe(true);
    t.fire('minimize');
    expect([t.visibility.visible(), t.visibility.onScreen()]).toEqual([true, false]);
    t.fire('restore');
    expect(t.visibility.onScreen()).toBe(true);
    t.window.isVisible.mockReturnValue(true);
    t.fire('hide');
    expect([t.visibility.visible(), t.visibility.onScreen()]).toEqual([false, false]);
    expect(t.onChange).toHaveBeenCalledTimes(4);
  });
});
