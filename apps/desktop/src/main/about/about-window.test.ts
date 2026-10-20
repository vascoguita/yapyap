import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../views.ts';
import { createAboutOpener, type AboutWindowPort } from './about-window.ts';

function fakeWindow() {
  let ready: () => void = () => undefined;
  let destroyed = false;
  const window = {
    webContents: {},
    isDestroyed: vi.fn(() => destroyed),
    focus: vi.fn(),
    once: vi.fn((_event: 'ready-to-show', listener: () => void) => {
      ready = listener;
    }),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies AboutWindowPort;
  return {
    window,
    ready: () => {
      ready();
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

function setup() {
  const windows = [fakeWindow(), fakeWindow()] as const;
  const createWindow = vi
    .fn<() => AboutWindowPort>()
    .mockReturnValueOnce(windows[0].window)
    .mockReturnValueOnce(windows[1].window);
  const views = new WeakMap<object, ViewInfo>();
  const warn = vi.fn();
  return {
    windows,
    createWindow,
    views,
    warn,
    open: createAboutOpener({ createWindow, views, warn }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('createAboutOpener', () => {
  it('opens a small, fixed-size chrome window on the About page and shows it when ready', () => {
    const t = setup();
    t.open();
    const [first] = t.windows;
    expect(t.createWindow).toHaveBeenCalledExactlyOnceWith({
      title: 'About YapYap',
      width: 480,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    expect(t.views.get(first.window.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    expect(first.window.loadURL).toHaveBeenCalledWith('app://chrome/about.html');
    expect(first.window.show).not.toHaveBeenCalled();
    first.ready();
    expect(first.window.show).toHaveBeenCalledOnce();
  });

  it('focuses the open window instead of opening another', () => {
    const t = setup();
    t.open();
    t.open();
    expect(t.createWindow).toHaveBeenCalledOnce();
    expect(t.windows[0].window.focus).toHaveBeenCalledOnce();
  });

  it('opens a new window after the previous one was closed', () => {
    const t = setup();
    t.open();
    t.windows[0].destroy();
    t.open();
    expect(t.createWindow).toHaveBeenCalledTimes(2);
    expect(t.windows[0].window.focus).not.toHaveBeenCalled();
  });

  it('logs a page that fails to load', async () => {
    const t = setup();
    t.windows[0].window.loadURL.mockRejectedValueOnce(new Error('ERR_FAILED'));
    t.open();
    await settle();
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('Could not load the About window.');
  });
});
