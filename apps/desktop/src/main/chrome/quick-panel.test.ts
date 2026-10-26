import { describe, expect, it, vi } from 'vitest';
import type { SidebarState } from '../../shared/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { createQuickPanel, panelPlaceIn, panelPosition } from './quick-panel.ts';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };
const SIDE = { x: 1920, y: 0, width: 1280, height: 1000 };
const SIZE = { x: 0, y: 0, width: 260, height: 360 };

const STATE: SidebarState = {
  accounts: [
    {
      id: 'work',
      name: 'Work',
      color: 'blue',
      unread: 2,
      muted: false,
      active: true,
      sharing: false,
      avatar: undefined,
    },
  ],
  compact: false,
  doNotDisturb: false,
};

function panelWindow() {
  const moved: (() => void)[] = [];
  let destroyed = false;
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => destroyed,
    focus: vi.fn(),
    once: vi.fn(),
    on: vi.fn((_event: 'moved', listener: () => void) => {
      moved.push(listener);
    }),
    show: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(() => {
      destroyed = true;
    }),
    loadURL: vi.fn(() => Promise.resolve()),
    setPosition: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 120, width: 260, height: 360 })),
    move: () => {
      for (const listener of moved) {
        listener();
      }
    },
  };
}

function setup(general: Partial<Settings['general']> = {}, wayland = false) {
  const base = defaultSettings();
  let settings: Settings = { ...base, general: { ...base.general, ...general } };
  const listeners: ((settings: Settings) => void)[] = [];
  const windows: ReturnType<typeof panelWindow>[] = [];
  const deps = {
    open: vi.fn(() => {
      const window = panelWindow();
      windows.push(window);
      return window;
    }),
    settings: {
      current: () => settings,
      onChange: (listener: (settings: Settings) => void) => {
        listeners.push(listener);
      },
      update: vi.fn((change: (current: Settings) => Settings) => {
        settings = change(settings);
      }),
    },
    wayland,
    workAreas: vi.fn(() => [SCREEN, SIDE]),
    place: { get: vi.fn((): { x: number; y: number } | undefined => undefined), set: vi.fn() },
  };
  const panel = createQuickPanel(deps);
  let visible = true;
  const owner = { visible: () => visible, bringToFront: vi.fn() };
  const source = { state: STATE, switchTo: vi.fn(), stopSharing: vi.fn() };
  return {
    deps,
    panel,
    owner,
    source,
    windows,
    setVisible: (next: boolean) => {
      visible = next;
    },
    change: (next: Partial<Settings['general']>) => {
      settings = { ...settings, general: { ...settings.general, ...next } };
      for (const listener of listeners) {
        listener(settings);
      }
    },
    handler: (channel: string) => {
      const found = panel.handlers.find((candidate) => candidate.channel === channel);
      if (found === undefined) {
        throw new Error(`No handler for ${channel}.`);
      }
      return found;
    },
  };
}

describe('panelPosition', () => {
  it('puts the panel in a corner of the main screen, clear of its edges', () => {
    const areas = [SCREEN, SIDE];
    expect(panelPosition('topLeft', SIZE, areas, undefined)).toEqual({ x: 16, y: 16 });
    expect(panelPosition('topRight', SIZE, areas, undefined)).toEqual({ x: 1644, y: 16 });
    expect(panelPosition('bottomLeft', SIZE, areas, undefined)).toEqual({ x: 16, y: 664 });
    expect(panelPosition('bottomRight', SIZE, areas, undefined)).toEqual({ x: 1644, y: 664 });
  });

  it('goes back where the user left it, if that is still on a screen', () => {
    const areas = [SCREEN, SIDE];
    expect(panelPosition('free', SIZE, areas, { x: 2000, y: 100 })).toEqual({ x: 2000, y: 100 });
    expect(panelPosition('free', SIZE, areas, { x: 3100, y: 100 })).toBeUndefined();
    expect(panelPosition('free', SIZE, areas, { x: 100, y: 900 })).toBeUndefined();
    expect(panelPosition('free', SIZE, areas, { x: -10, y: 0 })).toBeUndefined();
    expect(panelPosition('free', SIZE, areas, { x: 0, y: -10 })).toBeUndefined();
    expect(panelPosition('free', SIZE, areas, undefined)).toBeUndefined();
    expect(panelPosition('topLeft', SIZE, [], { x: 5, y: 5 })).toBeUndefined();
  });
});

describe('panelPlaceIn', () => {
  it('reads the last place, and counts anything else as none', () => {
    const file = (text: string) => ({ read: () => text, write: vi.fn() });
    expect(panelPlaceIn(file('{"x":10,"y":-20}')).get()).toEqual({ x: 10, y: -20 });
    expect(panelPlaceIn(file('{"x":10.5,"y":0}')).get()).toBeUndefined();
    expect(panelPlaceIn(file('{"x":10,"y":200000}')).get()).toBeUndefined();
    expect(panelPlaceIn(file('[')).get()).toBeUndefined();
    const saved = file('');
    const place = panelPlaceIn(saved);
    place.set({ x: 3, y: 4 });
    expect(place.get()).toEqual({ x: 3, y: 4 });
    expect(saved.write).toHaveBeenCalledExactlyOnceWith('{"x":3,"y":4}');
  });
});

describe('createQuickPanel', () => {
  it('stays closed until the user turns it on', () => {
    const t = setup();
    t.panel.attach(t.owner)(t.source);
    expect(t.deps.open).not.toHaveBeenCalled();
    t.change({ quickPanel: 'always' });
    expect(t.deps.open).toHaveBeenCalledOnce();
    t.change({ quickPanel: 'off' });
    expect(t.windows[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('waits for the main window before it opens, and for the accounts before it shows them', () => {
    const t = setup();
    t.change({ quickPanel: 'always' });
    expect(t.deps.open).not.toHaveBeenCalled();
    t.panel.attach(t.owner);
    t.change({ doNotDisturb: true });
    t.change({ doNotDisturb: false });
    expect(t.deps.open).toHaveBeenCalledOnce();
    expect(t.windows[0]?.webContents.send).not.toHaveBeenCalled();
  });

  it('stands in for the main window while it is out of sight, if asked to', () => {
    const t = setup({ quickPanel: 'whenHidden' });
    const show = t.panel.attach(t.owner);
    show(t.source);
    expect(t.deps.open).not.toHaveBeenCalled();
    t.setVisible(false);
    show(t.source);
    expect(t.deps.open).toHaveBeenCalledOnce();
    show(t.source);
    expect(t.windows[0]?.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'sidebar:state-changed',
      STATE,
    );
    t.setVisible(true);
    show(t.source);
    expect(t.windows[0]?.destroy).toHaveBeenCalledOnce();
  });

  it('opens again once the panel window is gone', () => {
    const t = setup({ quickPanel: 'always' });
    const show = t.panel.attach(t.owner);
    show(t.source);
    t.windows[0]?.destroy();
    show(t.source);
    expect(t.deps.open).toHaveBeenCalledTimes(2);
  });

  it('places the panel in its corner, and moves it when the corner changes', () => {
    const t = setup({ quickPanel: 'always', quickPanelPlace: 'topLeft' });
    t.panel.attach(t.owner)(t.source);
    expect(t.windows[0]?.setPosition).toHaveBeenCalledExactlyOnceWith(16, 16);
    t.change({ quickPanelPlace: 'bottomRight' });
    expect(t.windows[0]?.setPosition).toHaveBeenLastCalledWith(1644, 664);
    t.change({ doNotDisturb: true });
    expect(t.windows[0]?.setPosition).toHaveBeenCalledTimes(2);
    // Where the user drags it is only kept for a panel without a corner.
    t.windows[0]?.move();
    expect(t.deps.place.set).not.toHaveBeenCalled();
  });

  it('remembers where the user leaves it, and goes back there', () => {
    const t = setup({ quickPanel: 'always' });
    t.deps.place.get.mockReturnValue({ x: 2000, y: 40 });
    t.panel.attach(t.owner)(t.source);
    expect(t.windows[0]?.setPosition).toHaveBeenCalledExactlyOnceWith(2000, 40);
    t.windows[0]?.move();
    expect(t.deps.place.set).toHaveBeenCalledExactlyOnceWith({ x: 100, y: 120 });
  });

  it('leaves the position to Wayland, which decides it', () => {
    const t = setup({ quickPanel: 'always', quickPanelPlace: 'topLeft' }, true);
    t.panel.attach(t.owner)(t.source);
    t.change({ quickPanelPlace: 'free' });
    t.windows[0]?.move();
    expect(t.windows[0]?.setPosition).not.toHaveBeenCalled();
    expect(t.deps.place.set).not.toHaveBeenCalled();
  });

  it('switches to a listed account and brings the main window back', () => {
    const t = setup();
    const open = t.handler('quick-panel:open');
    expect(open.accepts(['work'])).toBe(false);
    t.panel.attach(t.owner)(t.source);
    expect(open.accepts(['work'])).toBe(true);
    expect(open.accepts(['home'])).toBe(false);
    expect(open.accepts(['work', 'more'])).toBe(false);
    open.handle({ sender: {} }, 'work');
    expect(t.source.switchTo).toHaveBeenCalledExactlyOnceWith('work');
    expect(t.owner.bringToFront).toHaveBeenCalledOnce();
  });

  it('turns Do not disturb on and off', () => {
    const t = setup();
    const quiet = t.handler('quick-panel:set-do-not-disturb');
    expect(quiet.accepts([true])).toBe(true);
    expect(quiet.accepts(['yes'])).toBe(false);
    expect(quiet.accepts([true, 1])).toBe(false);
    quiet.handle({ sender: {} }, true);
    expect(t.deps.settings.current().general.doNotDisturb).toBe(true);
  });
});
