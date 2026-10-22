import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { setUpTray } from './tray.ts';

function setup(minimized = false) {
  let click: (() => void) | undefined;
  const tray = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn((_event: 'click', listener: () => void) => {
      click = listener;
    }),
  };
  const window = {
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
  const deps = {
    buildMenu: vi.fn((template: MenuItemConstructorOptions[]) => template),
    quit: vi.fn(),
  };
  setUpTray(tray, window, deps);
  const template = deps.buildMenu.mock.calls[0]?.[0] ?? [];
  return { tray, window, deps, template, click: () => click?.() };
}

describe('setUpTray', () => {
  it('shows the window from the icon, restoring it when minimized', () => {
    const t = setup(true);
    expect(t.tray.setToolTip).toHaveBeenCalledExactlyOnceWith('YapYap');
    t.click();
    expect(t.window.restore).toHaveBeenCalledOnce();
    expect(t.window.show).toHaveBeenCalledOnce();
    expect(t.window.focus).toHaveBeenCalledOnce();
  });

  it('offers Show and Quit in its menu', () => {
    const t = setup();
    expect(t.tray.setContextMenu).toHaveBeenCalledExactlyOnceWith(t.template);
    expect(t.template.map((item) => item.label ?? item.type)).toEqual([
      'Show YapYap',
      'separator',
      'Quit YapYap',
    ]);
    (t.template[0]?.click as () => void)();
    expect(t.window.show).toHaveBeenCalledOnce();
    expect(t.window.restore).not.toHaveBeenCalled();
    (t.template[2]?.click as () => void)();
    expect(t.deps.quit).toHaveBeenCalledOnce();
  });
});
