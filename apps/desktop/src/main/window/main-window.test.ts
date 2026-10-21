import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { manageMainWindow, restoreWindowState, type ManagedWindow } from './main-window.ts';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };
const BOUNDS = { x: 100, y: 80, width: 1000, height: 700 };

function setup(platform = 'linux', autoHideMenuBar = false) {
  const windowListeners = new Map<string, (event: { preventDefault(): void }) => void>();
  const appListeners = new Map<string, () => void>();
  const settingsListeners: ((settings: Settings) => void)[] = [];
  const window = {
    getNormalBounds: vi.fn(() => BOUNDS),
    isMaximized: vi.fn(() => true),
    isFullScreen: vi.fn(() => false),
    maximize: vi.fn(),
    setFullScreen: vi.fn(),
    setAutoHideMenuBar: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    on: vi.fn((event: string, listener: (event: { preventDefault(): void }) => void) => {
      windowListeners.set(event, listener);
    }),
  } satisfies ManagedWindow;
  const settings = defaultSettings();
  const deps = {
    store: { read: vi.fn(() => ''), write: vi.fn() },
    platform,
    settings: {
      current: () => ({
        ...settings,
        appearance: { ...settings.appearance, autoHideMenuBar },
      }),
      onChange: (listener: (settings: Settings) => void) => {
        settingsListeners.push(listener);
      },
    },
    app: {
      on: vi.fn((event: string, listener: () => void) => {
        appListeners.set(event, listener);
      }),
    },
    warn: vi.fn(),
  };
  const close = () => {
    const preventDefault = vi.fn();
    windowListeners.get('close')?.({ preventDefault });
    return preventDefault;
  };
  const changeSettings = (hide: boolean) => {
    for (const listener of settingsListeners) {
      listener({ ...settings, appearance: { ...settings.appearance, autoHideMenuBar: hide } });
    }
  };
  return { window, deps, close, appListeners, windowListeners, changeSettings };
}

describe('restoreWindowState', () => {
  it('restores saved bounds that land on a display', () => {
    const saved = JSON.stringify({ bounds: BOUNDS, maximized: true, fullScreen: false });
    expect(restoreWindowState({ read: () => saved, write: vi.fn() }, [SCREEN])).toEqual({
      state: { bounds: BOUNDS, maximized: true, fullScreen: false },
      bounds: BOUNDS,
    });
  });

  it('starts from the default when nothing was saved yet', () => {
    const missing = {
      read: () => {
        throw new Error('ENOENT');
      },
      write: vi.fn(),
    };
    expect(restoreWindowState(missing, [SCREEN])).toEqual({
      state: { maximized: false, fullScreen: false },
      bounds: undefined,
    });
  });
});

describe('manageMainWindow', () => {
  it('restores the maximized and full-screen state', () => {
    const t = setup();
    manageMainWindow(t.window, { maximized: true, fullScreen: true }, t.deps);
    expect(t.window.maximize).toHaveBeenCalledOnce();
    expect(t.window.setFullScreen).toHaveBeenCalledExactlyOnceWith(true);
    const plain = setup();
    manageMainWindow(plain.window, { maximized: false, fullScreen: false }, plain.deps);
    expect(plain.window.maximize).not.toHaveBeenCalled();
    expect(plain.window.setFullScreen).not.toHaveBeenCalled();
  });

  it('saves the window state on close and lets the window close outside macOS', () => {
    const t = setup();
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    expect(t.close()).not.toHaveBeenCalled();
    expect(t.deps.store.write).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ bounds: BOUNDS, maximized: true, fullScreen: false }),
    );
    expect(t.window.hide).not.toHaveBeenCalled();
  });

  it('saves the window state when a Windows session ends', () => {
    const t = setup('win32');
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    t.windowListeners.get('session-end')?.({ preventDefault: vi.fn() });
    expect(t.deps.store.write).toHaveBeenCalledOnce();
  });

  it('logs a state it could not save and still closes', () => {
    const t = setup();
    t.deps.store.write.mockImplementationOnce(() => {
      throw new Error('EROFS');
    });
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    expect(t.close()).not.toHaveBeenCalled();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not save the window position.');
  });

  it('hides the window on macOS until the Dock icon is clicked, and closes it on Quit', () => {
    const t = setup('darwin');
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    expect(t.close()).toHaveBeenCalledOnce();
    expect(t.window.hide).toHaveBeenCalledOnce();
    t.appListeners.get('activate')?.();
    expect(t.window.show).toHaveBeenCalledOnce();
    t.appListeners.get('before-quit')?.();
    expect(t.close()).not.toHaveBeenCalled();
    expect(t.window.hide).toHaveBeenCalledOnce();
    expect(t.deps.store.write).toHaveBeenCalledTimes(2);
  });

  it('follows the menu bar setting live outside macOS', () => {
    const t = setup('linux', true);
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    expect(t.window.setAutoHideMenuBar).toHaveBeenLastCalledWith(true);
    expect(t.window.setMenuBarVisibility).toHaveBeenLastCalledWith(false);
    t.changeSettings(false);
    expect(t.window.setAutoHideMenuBar).toHaveBeenLastCalledWith(false);
    expect(t.window.setMenuBarVisibility).toHaveBeenLastCalledWith(true);
  });

  it('leaves the macOS menu bar alone', () => {
    const t = setup('darwin', true);
    manageMainWindow(t.window, { maximized: false, fullScreen: false }, t.deps);
    t.changeSettings(false);
    expect(t.window.setAutoHideMenuBar).not.toHaveBeenCalled();
    expect(t.window.setMenuBarVisibility).not.toHaveBeenCalled();
  });
});
