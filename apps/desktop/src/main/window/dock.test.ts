import { describe, expect, it, vi } from 'vitest';
import { dockFollowsWindow, type DockPort } from './dock.ts';

function setup(dock: DockPort | undefined) {
  const shown: (() => void)[] = [];
  const window = {
    on: vi.fn((_event: 'show', listener: () => void) => {
      shown.push(listener);
    }),
  };
  const deps = { dock, focus: vi.fn(), warn: vi.fn() };
  const leave = dockFollowsWindow(window, deps);
  const show = () => {
    for (const listener of shown) {
      listener();
    }
  };
  return { window, deps, leave, show };
}

const fakeDock = (show: () => Promise<void> = () => Promise.resolve()) => ({
  hide: vi.fn(),
  show: vi.fn(show),
});

describe('dockFollowsWindow', () => {
  it('does nothing off macOS, where there is no Dock', () => {
    const t = setup(undefined);
    t.leave();
    expect(t.window.on).not.toHaveBeenCalled();
  });

  it('takes YapYap off the Dock, and brings it back to the front once the window shows', async () => {
    const dock = fakeDock();
    const t = setup(dock);
    t.leave();
    expect(dock.hide).toHaveBeenCalledOnce();
    t.show();
    expect(dock.show).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(t.deps.focus).toHaveBeenCalledOnce();
    });
    t.show();
    expect(dock.show).toHaveBeenCalledOnce();
  });

  it('leaves the Dock as it is when the window shows while YapYap is in it', () => {
    const dock = fakeDock();
    const t = setup(dock);
    t.show();
    expect(dock.show).not.toHaveBeenCalled();
    expect(t.deps.focus).not.toHaveBeenCalled();
  });

  it('logs a Dock that would not take YapYap back', async () => {
    const dock = fakeDock(() => Promise.reject(new Error('refused')));
    const t = setup(dock);
    t.leave();
    t.show();
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
        'Could not show YapYap in the Dock again.',
      );
    });
    expect(t.deps.focus).not.toHaveBeenCalled();
  });
});
