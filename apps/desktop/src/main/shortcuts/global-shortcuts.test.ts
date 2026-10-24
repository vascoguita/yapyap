import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { followGlobalShortcuts, toggleWindow } from './global-shortcuts.ts';

function setup(keys = '') {
  const base = defaultSettings();
  let settings: Settings = {
    ...base,
    shortcuts: { ...base.shortcuts, global: { toggleWindow: keys } },
  };
  let listener: ((settings: Settings) => void) | undefined;
  const port = { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() };
  const toggle = vi.fn();
  followGlobalShortcuts(
    port,
    {
      current: () => settings,
      onChange: (next) => {
        listener = next;
      },
    },
    { toggleWindow: toggle },
  );
  const change = (next: string) => {
    settings = {
      ...settings,
      shortcuts: { ...settings.shortcuts, global: { toggleWindow: next } },
    };
    listener?.(settings);
  };
  return { port, toggle, change };
}

describe('followGlobalShortcuts', () => {
  it('takes the keys the user set, and swaps or gives them back as they change', () => {
    const t = setup('CmdOrCtrl+Alt+Y');
    expect(t.port.register).toHaveBeenCalledExactlyOnceWith('CmdOrCtrl+Alt+Y', t.toggle);
    t.change('CmdOrCtrl+Alt+Y');
    expect(t.port.register).toHaveBeenCalledOnce();
    t.change('F9');
    expect(t.port.unregister).toHaveBeenCalledExactlyOnceWith('CmdOrCtrl+Alt+Y');
    expect(t.port.register).toHaveBeenLastCalledWith('F9', t.toggle);
    t.change('');
    expect(t.port.unregister).toHaveBeenLastCalledWith('F9');
    expect(t.port.register).toHaveBeenCalledTimes(2);
  });

  it('takes no keys until the user sets some, and none that do not fit', () => {
    const t = setup();
    expect(t.port.register).not.toHaveBeenCalled();
    t.change('Y');
    expect(t.port.register).not.toHaveBeenCalled();
  });
});

describe('toggleWindow', () => {
  const window = (visible: boolean, focused: boolean, minimized = false) => ({
    isVisible: () => visible,
    isFocused: () => focused,
    isMinimized: () => minimized,
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
  });

  it('hides a window in front, and brings any other forward', () => {
    const front = window(true, true);
    toggleWindow(front);
    expect(front.hide).toHaveBeenCalledOnce();
    for (const behind of [window(true, false), window(false, false, true)]) {
      toggleWindow(behind);
      expect(behind.hide).not.toHaveBeenCalled();
      expect(behind.show).toHaveBeenCalledOnce();
      expect(behind.focus).toHaveBeenCalledOnce();
    }
  });
});
