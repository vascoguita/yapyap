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

const { createAccountHost, createSecureWindow, createSidebarView } = await import('./windows.ts');

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

interface FakeView {
  readonly options: unknown;
  readonly setBounds: ReturnType<typeof vi.fn>;
  readonly webContents: { close: ReturnType<typeof vi.fn> };
}

describe('createAccountHost', () => {
  function fakeWindow() {
    const listeners = new Set<() => void>();
    let size = [800, 600];
    const children: FakeView[] = [];
    const closedListeners: (() => void)[] = [];
    const window = {
      contentView: {
        addChildView: vi.fn((view: FakeView) => children.push(view)),
        removeChildView: vi.fn((view: FakeView) => children.splice(children.indexOf(view), 1)),
      },
      getContentSize: vi.fn(() => size),
      on: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
      off: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
      once: vi.fn((_event: 'closed', listener: () => void) => {
        closedListeners.push(listener);
      }),
    };
    return {
      window,
      children,
      resize: (width: number, height: number) => {
        size = [width, height];
        listeners.forEach((listener) => {
          listener();
        });
      },
      listeners: () => listeners.size,
      close: () => {
        for (const listener of closedListeners) {
          listener();
        }
      },
    };
  }

  beforeEach(() => {
    constructed.length = 0;
  });

  it('docks the sidebar on the left, leaving the rest to the account, and takes it away', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.show();
    const sidebar = createSidebarView(f.window as never, { preload: '/p.cjs' });
    sidebar.setWidth(220);
    sidebar.setWidth(64);
    const [page, bar] = f.children;
    if (page === undefined || bar === undefined) {
      throw new Error('Both views should be in the window.');
    }
    expect(f.children).toHaveLength(2);
    expect(bar.webContents).toBe(sidebar.webContents);
    expect(bar.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 64, height: 600 });
    expect(page.setBounds).toHaveBeenLastCalledWith({ x: 64, y: 0, width: 736, height: 600 });
    f.resize(40, 500);
    expect(bar.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 64, height: 500 });
    expect(page.setBounds).toHaveBeenLastCalledWith({ x: 40, y: 0, width: 0, height: 500 });
    sidebar.setWidth(0);
    sidebar.setWidth(0);
    expect(f.children).toEqual([page]);
    expect(page.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 40, height: 500 });
    f.window.getContentSize.mockReturnValueOnce([]);
    sidebar.setWidth(10);
    expect(bar.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 10, height: 0 });
    f.close();
    expect(bar.webContents.close).toHaveBeenCalledOnce();
  });

  it('creates the account’s page hardened, in its partition, and hidden', () => {
    const f = fakeWindow();
    createAccountHost(f.window as never, { partition: 'persist:account-a' });
    expect(constructed).toStrictEqual([
      { webPreferences: rendererPreferences({ partition: 'persist:account-a' }) },
    ]);
    expect(f.children).toHaveLength(0);
  });

  it('shows the page with its overlays on top, fitted to the window as it resizes', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    const overlay = host.createOverlay({ preload: '/p.cjs' });
    expect(f.children).toHaveLength(0);
    host.show();
    host.show();
    const [page, laid] = f.children;
    expect(f.children).toHaveLength(2);
    expect(page?.webContents).toBe(host.webContents);
    expect(laid?.webContents).toBe(overlay.webContents);
    expect(laid?.options).toStrictEqual({
      webPreferences: rendererPreferences({ preload: '/p.cjs' }),
    });
    expect(page?.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 800, height: 600 });
    f.resize(1024, 700);
    expect(laid?.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1024, height: 700 });
  });

  it('lays a new overlay over a shown account at once', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.show();
    const overlay = host.createOverlay({});
    expect(f.children.at(-1)?.webContents).toBe(overlay.webContents);
  });

  it('hides every view of the account and stops fitting them', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.createOverlay({});
    host.show();
    host.hide();
    expect(f.children).toHaveLength(0);
    expect(f.listeners()).toBe(0);
  });

  it('removes and closes an overlay, shown or not', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.show();
    const shown = host.createOverlay({});
    shown.remove();
    expect(f.children).toHaveLength(1);
    host.hide();
    const hidden = host.createOverlay({});
    hidden.remove();
    host.show();
    expect(f.children).toHaveLength(1);
    expect(constructed).toHaveLength(3);
  });

  it('closes every page for good', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.createOverlay({});
    host.show();
    const views = [...f.children];
    host.close();
    expect(f.children).toHaveLength(0);
    for (const view of views) {
      expect(view.webContents.close).toHaveBeenCalledOnce();
    }
  });

  it('closes the account’s pages when the window closes, and only once', () => {
    const f = fakeWindow();
    const host = createAccountHost(f.window as never, {});
    host.createOverlay({});
    host.show();
    const views = [...f.children];
    f.close();
    host.close();
    for (const view of views) {
      expect(view.webContents.close).toHaveBeenCalledOnce();
    }
  });

  it('tolerates a window that reports no size', () => {
    const f = fakeWindow();
    f.window.getContentSize.mockReturnValueOnce([]);
    const host = createAccountHost(f.window as never, {});
    host.show();
    expect(f.children[0]?.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 });
  });
});
