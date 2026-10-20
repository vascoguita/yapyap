import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ID } from './identity.ts';
import { SHOW_FALLBACK_MS, startApp, type AppPort, type WindowPort } from './start.ts';
import { WHATSAPP_ORIGIN } from './whatsapp-origin.ts';
import type { WindowOptions } from './windows.ts';

type Listener = (...args: never[]) => void;

/** A web contents whose listeners the test can fire by event name. */
function fakeContents() {
  const handlers = new Map<string, Listener[]>();
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      handlers.set(event, [...(handlers.get(event) ?? []), listener]);
    }),
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of handlers.get(event) ?? []) listener(...(args as never[]));
  };
  return { contents, fire };
}

function fakes(env: Record<string, string | undefined> = {}) {
  const web = fakeContents();
  const listeners = new Map<string, (...args: never[]) => void>();
  const app = {
    enableSandbox: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    setAppUserModelId: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => void) =>
      listeners.set(event, listener),
    ),
    quit: vi.fn(),
  } satisfies AppPort;
  const window = {
    webContents: web.contents,
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies WindowPort;
  const createWindow = vi.fn<(options: WindowOptions) => WindowPort>(() => window);
  const warn = vi.fn();
  const openExternal = vi.fn(() => Promise.resolve());
  return { app, window, web, createWindow, warn, openExternal, env, listeners };
}

describe('startApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a hidden, hardened window on the real WhatsApp origin and shows it when ready', async () => {
    const f = fakes();
    await startApp(f);

    expect(f.app.setAppUserModelId).toHaveBeenCalledWith(APP_ID);
    expect(f.createWindow).toHaveBeenCalledWith(expect.objectContaining({ show: false }));
    expect(f.window.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.window.show).not.toHaveBeenCalled();
    f.listeners.get('ready-to-show')?.();
    expect(f.window.show).toHaveBeenCalledOnce();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('sandboxes every renderer and guards every web contents before the app is ready', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.enableSandbox).toHaveBeenCalledOnce();
      expect(f.listeners.has('web-contents-created')).toBe(true);
      return Promise.resolve();
    });
    await startApp(f);
    const other = fakeContents();
    f.listeners.get('web-contents-created')?.(...([{}, other.contents] as never[]));
    const attach = { preventDefault: vi.fn() };
    other.fire('will-attach-webview', attach);
    expect(attach.preventDefault).toHaveBeenCalledOnce();
    expect(other.contents.setWindowOpenHandler).toHaveBeenCalledOnce();
  });

  it('keeps the window on its origin and opens other links in the browser', async () => {
    const f = fakes();
    await startApp(f);
    f.listeners.get('web-contents-created')?.(...([{}, f.web.contents] as never[]));
    const inside = { url: `${WHATSAPP_ORIGIN}/x`, isMainFrame: true, preventDefault: vi.fn() };
    const outside = { url: 'https://example.com/', isMainFrame: true, preventDefault: vi.fn() };
    f.web.fire('will-navigate', inside);
    f.web.fire('will-navigate', outside);
    expect(inside.preventDefault).not.toHaveBeenCalled();
    expect(outside.preventDefault).toHaveBeenCalledOnce();
    expect(f.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('shows the window after a fallback delay when ready-to-show never fires, exactly once', async () => {
    const f = fakes();
    await startApp(f);
    vi.advanceTimersByTime(SHOW_FALLBACK_MS - 1);
    expect(f.window.show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.window.show).toHaveBeenCalledOnce();
    f.listeners.get('ready-to-show')?.();
    expect(f.window.show).toHaveBeenCalledOnce();
  });

  it('does not show the window twice when ready-to-show fires before the fallback', async () => {
    const f = fakes();
    await startApp(f);
    f.listeners.get('ready-to-show')?.();
    vi.advanceTimersByTime(SHOW_FALLBACK_MS);
    expect(f.window.show).toHaveBeenCalledOnce();
  });

  it('waits for the app to be ready before creating the window', async () => {
    const f = fakes();
    let ready: () => void = () => undefined;
    f.app.whenReady.mockReturnValueOnce(new Promise<void>((resolve) => (ready = resolve)));
    const started = startApp(f);
    await Promise.resolve();
    expect(f.createWindow).not.toHaveBeenCalled();
    ready();
    await started;
    expect(f.createWindow).toHaveBeenCalledOnce();
  });

  it('quits when every window is closed', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.app.quit).not.toHaveBeenCalled();
    f.listeners.get('window-all-closed')?.();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('loads a loopback test origin when one is configured', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'http://127.0.0.1:4321' });
    await startApp(f);
    expect(f.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:4321');
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('warns and loads the real origin when the test origin is not loopback', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'https://evil.example' });
    await startApp(f);
    expect(f.window.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.warn).toHaveBeenCalledWith(expect.stringContaining('only loopback'));
  });
});
