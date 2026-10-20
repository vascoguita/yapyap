import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ID } from './identity.ts';
import { SHOW_FALLBACK_MS, startApp, type AppPort, type WindowPort } from './start.ts';
import { defaultSettings } from './settings/decode.ts';
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
    executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve()),
    reload: vi.fn(),
    forcefullyCrashRenderer: vi.fn(),
    session: {
      clearCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
    },
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
    userAgentFallback: '',
    disableHardwareAcceleration: vi.fn(),
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
    on: vi.fn(),
    setTitle: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies WindowPort;
  const createWindow = vi.fn<(options: WindowOptions) => WindowPort>(() => window);
  const runtime = {
    attachRecovery: vi.fn<
      (
        contents: unknown,
        origin: string,
        createOverlay: (renderer: object) => unknown,
      ) => { reconnect: () => void }
    >(() => ({ reconnect: vi.fn() })),
  };
  const warn = vi.fn();
  const openExternal = vi.fn(() => Promise.resolve());
  const session = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setUserAgent: vi.fn(),
    webRequest: { onBeforeSendHeaders: vi.fn() },
  };
  const capture = {
    contentsOfFrame: vi.fn(),
    isVisibleAndFocused: vi.fn(() => true),
    pickWithPortal: undefined,
    useSystemPicker: false,
  };
  return {
    app,
    runtime,
    window,
    web,
    session,
    createWindow,
    defaultSession: () => session,
    askMedia: vi.fn(() => Promise.resolve(true)),
    capture,
    chromeVersion: '152.0.7977.167',
    platform: 'linux',
    chrome: { beforeReady: vi.fn(), afterReady: vi.fn(() => runtime) },
    createOverlay: vi.fn(),
    warn,
    openExternal,
    isOnline: vi.fn(() => true),
    gpuCrashLog: { read: () => '[]', write: vi.fn() },
    settings: {
      current: () => defaultSettings(),
      notice: undefined as string | undefined,
      update: vi.fn(),
    },
    notify: vi.fn(),
    onResume: vi.fn(),
    env,
    listeners,
  };
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

  it('registers the chrome scheme before the app is ready and serves chrome after', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.chrome.beforeReady).toHaveBeenCalledOnce();
      expect(f.chrome.afterReady).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.chrome.afterReady).toHaveBeenCalledExactlyOnceWith(expect.any(WeakMap), f.warn);
  });

  it('watches the WhatsApp window and lays the recovery screen over that window', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.runtime.attachRecovery).toHaveBeenCalledExactlyOnceWith(
      f.web.contents,
      WHATSAPP_ORIGIN,
      expect.any(Function),
    );
    const [[, , createOverlay]] = f.runtime.attachRecovery.mock.calls as [
      [unknown, unknown, (renderer: object) => unknown],
    ];
    createOverlay({ preload: '/p.cjs' });
    expect(f.createOverlay).toHaveBeenCalledExactlyOnceWith(f.window, { preload: '/p.cjs' });
  });

  it('presents the bundled Chromium as desktop Chrome everywhere', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.userAgentFallback).toBe(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      );
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.session.setUserAgent).toHaveBeenCalledExactlyOnceWith(f.app.userAgentFallback);
    expect(f.session.webRequest.onBeforeSendHeaders).toHaveBeenCalledOnce();
  });

  it('applies the permission policy to the default session and to every new session', async () => {
    const f = fakes();
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.session.setPermissionRequestHandler).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    await startApp(f);
    expect(f.session.setPermissionRequestHandler).toHaveBeenCalledOnce();
    const created = { ...f.session, setPermissionRequestHandler: vi.fn(), setUserAgent: vi.fn() };
    f.listeners.get('session-created')?.(...([created] as never[]));
    expect(created.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(created.setUserAgent).toHaveBeenCalledExactlyOnceWith(f.app.userAgentFallback);
  });

  it('lets the WhatsApp window send notifications from its own origin', async () => {
    const f = fakes();
    await startApp(f);
    const [[handler]] = f.session.setPermissionRequestHandler.mock.calls as [
      [
        (
          contents: object,
          permission: string,
          callback: (granted: boolean) => void,
          details: object,
        ) => void,
      ],
    ];
    const callback = vi.fn();
    handler(f.web.contents, 'notifications', callback, { requestingUrl: `${WHATSAPP_ORIGIN}/` });
    handler(f.web.contents, 'geolocation', callback, { requestingUrl: `${WHATSAPP_ORIGIN}/` });
    expect(callback.mock.calls).toEqual([[true], [false]]);
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

  it('marks the title while offline and reconnects when the system wakes', async () => {
    vi.useFakeTimers();
    const f = fakes();
    const reconnect = vi.fn();
    f.runtime.attachRecovery.mockReturnValueOnce({ reconnect });
    f.isOnline.mockReturnValue(false);
    await startApp(f);
    expect(f.window.setTitle).toHaveBeenCalledWith('YapYap (offline)');
    const [[resume]] = f.onResume.mock.calls as [[() => void]];
    resume();
    vi.runOnlyPendingTimers();
    expect(reconnect).toHaveBeenCalled();
  });

  it('turns hardware acceleration off before ready when the settings say so', async () => {
    const f = fakes();
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, hardwareAcceleration: false },
    });
    f.app.whenReady.mockImplementationOnce(() => {
      expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
      return Promise.resolve();
    });
    await startApp(f);
  });

  it('keeps hardware acceleration on by default and tells the user about repaired settings', async () => {
    const f = fakes();
    f.settings.notice = 'Some settings were invalid and were reset to their defaults.';
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'Some settings were invalid and were reset to their defaults.',
    );
  });

  it('keeps running when WhatsApp fails to load, leaving it to the recovery screen', async () => {
    const f = fakes();
    f.window.loadURL.mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'));
    await expect(startApp(f)).resolves.toBeUndefined();
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
