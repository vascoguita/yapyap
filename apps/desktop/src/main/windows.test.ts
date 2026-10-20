import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rendererPreferences, secureWebPreferences } from './web-preferences.ts';

const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly options: unknown;
    constructor(options: unknown) {
      this.options = options;
      constructed.push(options);
    }
  },
  WebContentsView: class {
    readonly options: unknown;
    readonly setBounds = vi.fn();
    readonly webContents = { close: vi.fn() };
    constructor(options: unknown) {
      this.options = options;
      constructed.push(options);
    }
  },
}));

const { createSecureOverlay, createSecureWindow } = await import('./windows.ts');

describe('createSecureWindow', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it('creates the window with the hardened preferences', () => {
    createSecureWindow({ title: 'YapYap', show: false }, { preload: '/p.js' });
    expect(constructed).toStrictEqual([
      { title: 'YapYap', show: false, webPreferences: rendererPreferences({ preload: '/p.js' }) },
    ]);
  });

  it('ignores web preferences smuggled past the type system', () => {
    const smuggled = { webPreferences: { sandbox: false, nodeIntegration: true } };
    createSecureWindow(smuggled as unknown as { title: string });
    expect(constructed).toStrictEqual([{ webPreferences: secureWebPreferences() }]);
  });
});

describe('createSecureOverlay', () => {
  function fakeWindow() {
    const listeners = new Map<string, () => void>();
    let size = [800, 600];
    const window = {
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      getContentSize: vi.fn(() => size),
      on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
      off: vi.fn((event: string) => listeners.delete(event)),
    };
    return {
      window,
      resize: (width: number, height: number) => {
        size = [width, height];
        listeners.get('resize')?.();
      },
      listening: () => listeners.has('resize'),
    };
  }

  beforeEach(() => {
    constructed.length = 0;
  });

  it('lays a hardened view over the whole window and keeps it fitted', () => {
    const f = fakeWindow();
    const overlay = createSecureOverlay(f.window as never, { preload: '/p.cjs' });
    expect(constructed).toStrictEqual([
      { webPreferences: rendererPreferences({ preload: '/p.cjs' }) },
    ]);
    const [[view]] = f.window.contentView.addChildView.mock.calls as [
      [{ setBounds: ReturnType<typeof vi.fn> }],
    ];
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 800, height: 600 });
    f.resize(1024, 700);
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1024, height: 700 });
    expect(overlay.webContents).toBe((view as unknown as { webContents: object }).webContents);
  });

  it('detaches and closes the view on removal', () => {
    const f = fakeWindow();
    const overlay = createSecureOverlay(f.window as never, {});
    const [[view]] = f.window.contentView.addChildView.mock.calls as [
      [{ webContents: { close: ReturnType<typeof vi.fn> } }],
    ];
    overlay.remove();
    expect(f.window.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledOnce();
    expect(f.listening()).toBe(false);
  });

  it('tolerates a window that reports no size', () => {
    const f = fakeWindow();
    f.window.getContentSize.mockReturnValueOnce([]);
    createSecureOverlay(f.window as never, {});
    const [[view]] = f.window.contentView.addChildView.mock.calls as [
      [{ setBounds: ReturnType<typeof vi.fn> }],
    ];
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 });
  });
});
