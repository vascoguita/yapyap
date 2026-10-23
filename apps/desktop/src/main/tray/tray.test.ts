import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { setUpTray, type TrayState } from './tray.ts';

const PERSONAL = {
  id: 'a',
  name: 'Personal',
  color: 'green',
  enabled: true,
  muted: false,
  active: true,
};
const WORK = { id: 'b', name: 'Work', color: 'blue', enabled: true, muted: false, active: false };
const OFF = { id: 'c', name: 'Old', color: 'red', enabled: false, muted: false, active: false };

function setup(platform = 'linux', minimized = false) {
  let click: (() => void) | undefined;
  const tray = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    setTitle: vi.fn(),
    setImage: vi.fn(),
    on: vi.fn((_event: 'click', listener: () => void) => {
      click = listener;
    }),
  };
  const window = {
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
  };
  const deps = {
    platform,
    buildMenu: vi.fn((template: MenuItemConstructorOptions[]) => template),
    switchAccount: vi.fn(),
    openSettings: vi.fn(),
    setDoNotDisturb: vi.fn(),
    quit: vi.fn(),
  };
  const update = setUpTray(tray, window, deps);
  const menu = (state: TrayState) => {
    update(state);
    return deps.buildMenu.mock.calls.at(-1)?.[0] ?? [];
  };
  const item = (template: MenuItemConstructorOptions[], label: string) =>
    template.find((entry) => entry.label === label)?.click as () => void;
  return { tray, window, deps, menu, item, click: () => click?.() };
}

const state = (overrides: Partial<TrayState> = {}): TrayState => ({
  accounts: [PERSONAL],
  unread: 0,
  windowShown: false,
  doNotDisturb: false,
  ...overrides,
});

describe('setUpTray', () => {
  it('shows the window from the icon, restoring it when minimized', () => {
    const t = setup('linux', true);
    t.click();
    expect(t.window.restore).toHaveBeenCalledOnce();
    expect(t.window.show).toHaveBeenCalledOnce();
    expect(t.window.focus).toHaveBeenCalledOnce();
  });

  it('leaves clicks on the macOS menu bar item to its menu', () => {
    expect(setup('darwin').tray.on).not.toHaveBeenCalled();
  });

  it('offers Show, Do Not Disturb, Settings and Quit with one account', () => {
    const t = setup();
    const template = t.menu(state());
    expect(t.tray.setContextMenu).toHaveBeenLastCalledWith(template);
    expect(template.map((entry) => entry.label ?? entry.type)).toEqual([
      'Show YapYap',
      'separator',
      'Do Not Disturb',
      'Settings…',
      'separator',
      'Quit YapYap',
    ]);
    t.item(template, 'Show YapYap')();
    expect(t.window.show).toHaveBeenCalledOnce();
    t.item(template, 'Settings…')();
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    t.item(template, 'Quit YapYap')();
    expect(t.deps.quit).toHaveBeenCalledOnce();
  });

  it('turns do not disturb on and off, showing whether it is on', () => {
    const t = setup();
    const off = t.menu(state());
    expect(off.find((entry) => entry.label === 'Do Not Disturb')).toMatchObject({
      type: 'checkbox',
      checked: false,
    });
    t.item(off, 'Do Not Disturb')();
    expect(t.deps.setDoNotDisturb).toHaveBeenLastCalledWith(true);
    const on = t.menu(state({ doNotDisturb: true }));
    expect(on.find((entry) => entry.label === 'Do Not Disturb')?.checked).toBe(true);
    t.item(on, 'Do Not Disturb')();
    expect(t.deps.setDoNotDisturb).toHaveBeenLastCalledWith(false);
  });

  it('hides the window when it is shown', () => {
    const t = setup();
    t.item(t.menu(state({ windowShown: true })), 'Hide YapYap')();
    expect(t.window.hide).toHaveBeenCalledOnce();
  });

  it('lists the running accounts, and shows the one picked', () => {
    const t = setup();
    const template = t.menu(state({ accounts: [PERSONAL, WORK, OFF] }));
    expect(template.slice(1, 4)).toEqual([
      { type: 'separator' },
      expect.objectContaining({ label: 'Personal', type: 'radio', checked: true }),
      expect.objectContaining({ label: 'Work', checked: false }),
    ]);
    expect(template.some((entry) => entry.label === 'Old')).toBe(false);
    const muted = t.menu(state({ accounts: [PERSONAL, { ...WORK, muted: true }] }));
    expect(muted[3]?.label).toBe('Work (muted)');
    t.item(template, 'Work')();
    expect(t.deps.switchAccount).toHaveBeenCalledWith('b');
    expect(t.window.show).toHaveBeenCalledOnce();
  });

  it('shows the unread count in the tooltip, and beside the macOS menu bar item', () => {
    const linux = setup();
    linux.menu(state({ unread: 1 }));
    linux.menu(state({ unread: 3 }));
    linux.menu(state());
    expect(linux.tray.setToolTip.mock.calls).toEqual([
      ['YapYap: 1 unread chat'],
      ['YapYap: 3 unread chats'],
      ['YapYap'],
    ]);
    expect(linux.tray.setTitle).not.toHaveBeenCalled();
    const mac = setup('darwin');
    mac.menu(state({ unread: 3 }));
    mac.menu(state());
    expect(mac.tray.setTitle.mock.calls).toEqual([['3'], ['']]);
  });
});
