import { describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../../security/views.ts';
import { ENGINE_PARTITION, engineWindowOpener } from './engine-window.ts';

function fakeWindow(loads = true) {
  const closed: (() => void)[] = [];
  return {
    webContents: { send: vi.fn() },
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    focus: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => (loads ? Promise.resolve() : Promise.reject(new Error('no')))),
    once: vi.fn((_event: string, listener: () => void) => {
      closed.push(listener);
    }),
    closed,
  };
}

describe('engineWindowOpener', () => {
  it('opens a hidden window on the engine’s own session, as a view of its own origin', async () => {
    const window = fakeWindow();
    const views: ViewRegistry = new WeakMap();
    const createWindow = vi.fn(() => window);
    const open = engineWindowOpener({ createWindow, views, preload: '/engine.cjs', warn: vi.fn() });
    const engine = open();
    expect(createWindow).toHaveBeenCalledWith(
      { show: false, skipTaskbar: true, focusable: false, width: 1, height: 1 },
      { partition: ENGINE_PARTITION, preload: '/engine.cjs' },
    );
    expect(views.get(window.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://engine',
      label: 'YapYap',
    });
    expect(window.loadURL).toHaveBeenCalledWith('app://engine/engine.html');
    await engine.loaded;
    engine.send({ type: 'load', id: 1 });
    expect(window.webContents.send).toHaveBeenCalledWith('engine:command', { type: 'load', id: 1 });
    const listener = vi.fn();
    engine.onClosed(listener);
    window.closed[0]?.();
    expect(listener).toHaveBeenCalledOnce();
    engine.close();
    window.destroyed = true;
    engine.close();
    expect(window.close).toHaveBeenCalledOnce();
    expect(engine.contents).toBe(window.webContents);
  });

  it('says when the page did not load', async () => {
    const warn = vi.fn();
    const open = engineWindowOpener({
      createWindow: () => fakeWindow(false),
      views: new WeakMap(),
      preload: '/engine.cjs',
      warn,
    });
    await expect(open().loaded).rejects.toThrow('no');
    expect(warn).toHaveBeenCalledWith('Could not load the private model’s engine.');
  });
});
