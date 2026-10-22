import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ID } from './identity.ts';
import { SHOW_FALLBACK_MS } from './show-when-ready.ts';
import { startApp, type AppPort, type WindowPort } from './start.ts';
import type { CaptureChoice } from './permissions/session-guard.ts';
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
    setZoomFactor: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve()),
    reload: vi.fn(),
    forcefullyCrashRenderer: vi.fn(),
    getOSProcessId: () => 4242,
    setBackgroundThrottling: vi.fn(),
    session: {
      clearCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
    },
  };
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of handlers.get(event) ?? []) {
      listener(...(args as never[]));
    }
  };
  return { contents, fire };
}

function fakes(env: Record<string, string | undefined> = {}, argv: readonly string[] = []) {
  const web = fakeContents();
  const listeners = new Map<string, (...args: never[]) => void>();
  const app = {
    userAgentFallback: '',
    disableHardwareAcceleration: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    enableSandbox: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    setAppUserModelId: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => void) =>
      listeners.set(event, listener),
    ),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
  } satisfies AppPort;
  const window = {
    webContents: web.contents,
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    on: vi.fn(),
    setTitle: vi.fn(),
    show: vi.fn(),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    maximize: vi.fn(),
    setFullScreen: vi.fn(),
    getNormalBounds: vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    isMaximized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    setAutoHideMenuBar: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    setOverlayIcon: vi.fn(),
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
    pickCaptureSource: vi.fn<(contents: object) => Promise<CaptureChoice | undefined>>(() =>
      Promise.resolve({ video: { id: 'screen:1:0', name: 'Screen' } }),
    ),
    technicalDetails: () => 'YapYap 0.1.0 (deb)',
    openChatsWith: vi.fn<(open: (phone: string) => void) => void>(),
  };
  const stored = new Map<string, string>();
  const warn = vi.fn();
  const openExternal = vi.fn(() => Promise.resolve());
  const session = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setUserAgent: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    setSpellCheckerLanguages: vi.fn(),
    webRequest: { onBeforeSendHeaders: vi.fn() },
    on: vi.fn(),
  };
  const capture = {
    contentsOfFrame: vi.fn(),
    isVisibleAndFocused: vi.fn(() => true),
    pick: undefined,
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
    capture: vi.fn<
      (pickInApp: (contents: object) => Promise<unknown>, wayland: boolean) => typeof capture
    >(() => capture),
    chromeVersion: '152.0.7977.167',
    platform: 'linux',
    chrome: { beforeReady: vi.fn(), afterReady: vi.fn(() => runtime) },
    createOverlay: vi.fn(),
    warn,
    openExternal,
    isOnline: vi.fn(() => true),
    gpuCrashLog: { read: () => '[]', write: vi.fn() },
    selfUpdate: (() => {
      const instance = {
        autoDownload: false,
        autoInstallOnAppQuit: true,
        allowPrerelease: false,
        allowDowngrade: false,
        checkForUpdates: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        quitAndInstall: vi.fn(),
      };
      return {
        instance,
        updater: vi.fn(() => instance),
        askToInstall: vi.fn(() => Promise.resolve(false)),
      };
    })(),
    badge: {
      setBadgeCount: vi.fn(() => true),
      createImage: vi.fn(() => ({})),
    },
    tray: {
      create: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
      buildMenu: vi.fn((template: unknown) => template),
    },
    releases: {
      policy: 'manual' as 'manual' | 'notify' | 'self-update',
      currentVersion: '0.1.0',
      fetchJson: vi.fn(() =>
        Promise.resolve({ tag_name: 'v0.2.0', draft: false, prerelease: false }),
      ),
      showNotice: vi.fn(),
    },
    appMetrics: vi.fn(() => [{ pid: 4242, memory: { workingSetSize: 100 * 1024 } }]),
    idleSeconds: () => 600,
    settings: {
      current: () => defaultSettings(),
      notice: undefined as string | undefined,
      readOnly: false,
      update: vi.fn(),
      onChange: vi.fn(),
    },
    nativeTheme: { themeSource: 'light' as 'system' | 'light' | 'dark' },
    notify: vi.fn(),
    onResume: vi.fn(),
    env,
    argv,
    windowState: {
      read: vi.fn((): string => {
        throw new Error('ENOENT');
      }),
      write: vi.fn(),
    },
    workAreas: () => [{ x: 0, y: 0, width: 1920, height: 1040 }],
    shutdown: { onSignal: vi.fn(), onSystemShutdown: vi.fn() },
    sandboxDisabled: false,
    explainUnsafeStart: vi.fn(() => Promise.resolve(false)),
    logError: vi.fn(),
    downloads: { folder: () => '/home/someone/Downloads', taken: () => false },
    crashes: {
      files: {
        read: (name: string) => stored.get(name),
        write: vi.fn((name: string, text: string) => stored.set(name, text)),
        remove: (name: string) => {
          stored.delete(name);
        },
      },
      version: '0.1.0',
      previousLog: () => ['last line'],
      review: vi.fn<(report: string) => Promise<'report' | 'copy' | 'close'>>(() =>
        Promise.resolve('close'),
      ),
      writeClipboard: vi.fn(() => Promise.resolve()),
    },
    stored,
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
    expect(f.chrome.afterReady).toHaveBeenCalledExactlyOnceWith(
      expect.any(WeakMap),
      f.warn,
      'hardware accelerated, display X11 (automatic)',
    );
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
    // Answers settle as promises, since some requests wait for the user.
    await Promise.resolve();
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
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'software rendering (turned off in settings), display X11 (automatic)',
    );
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('puts Chromium on the display backend chosen in settings, before ready', async () => {
    const f = fakes({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' });
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, displayBackend: 'x11' },
    });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith('ozone-platform', 'x11');
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Function), false);
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'hardware accelerated, display X11 (settings)',
    );
  });

  it('uses the portal picker when Chromium runs natively on Wayland', async () => {
    const f = fakes({ WAYLAND_DISPLAY: 'wayland-0' });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Function), true);
  });

  it('logs why a display backend chosen in settings could not be used', async () => {
    const f = fakes({ DISPLAY: ':0' });
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      reliability: { ...settings.reliability, displayBackend: 'wayland' },
    });
    await startApp(f);
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.warn).toHaveBeenCalledWith(
      'The Wayland display backend was chosen in settings, but WAYLAND_DISPLAY is not set; using the automatic choice.',
    );
  });

  it('keeps hardware acceleration on by default and tells the user about repaired settings', async () => {
    const f = fakes();
    f.settings.notice = 'Some settings were invalid and were reset to their defaults.';
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(f.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(f.chrome.afterReady).toHaveBeenCalledWith(
      expect.anything(),
      f.warn,
      'hardware accelerated, display X11 (automatic)',
    );
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'Some settings were invalid and were reset to their defaults.',
    );
  });

  it('hands screen-sharing requests to YapYap’s picker once chrome is ready', async () => {
    const f = fakes();
    let ready: () => void = () => undefined;
    f.app.whenReady.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const started = startApp(f);
    const [[pickInApp]] = f.capture.mock.calls as unknown as [
      [(contents: object) => Promise<unknown>],
    ];
    const requester = {};
    expect(await pickInApp(requester)).toBeUndefined();
    ready();
    await started;
    expect(await pickInApp(requester)).toEqual({ video: { id: 'screen:1:0', name: 'Screen' } });
    expect(f.runtime.pickCaptureSource).toHaveBeenCalledExactlyOnceWith(requester);
  });

  it('reloads the WhatsApp window when it keeps using more memory than the setting allows', async () => {
    const f = fakes();
    await startApp(f);
    f.appMetrics.mockReturnValue([{ pid: 4242, memory: { workingSetSize: 3000 * 1024 } }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.web.contents.reload).toHaveBeenCalledOnce();
    expect(f.warn).toHaveBeenCalledWith(
      'The WhatsApp renderer used 3000 MB, over the 2048 MB limit; reloading it.',
    );
  });

  it('opens chats from the New Chat window in the WhatsApp window, brought to the front', async () => {
    const f = fakes();
    await startApp(f);
    const open = f.runtime.openChatsWith.mock.calls[0]?.[0];
    f.window.isMinimized.mockReturnValueOnce(true);
    open?.('447700900123');
    expect(f.window.restore).toHaveBeenCalledOnce();
    expect(f.window.focus).toHaveBeenCalled();
    expect(f.window.loadURL).toHaveBeenLastCalledWith(
      'https://web.whatsapp.com/send?phone=447700900123',
    );
    f.window.loadURL.mockRejectedValueOnce(new Error('ERR_INTERNET_DISCONNECTED'));
    open?.('447700900123');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('tells a portable build about a new release, and other builds never ask', async () => {
    const quiet = fakes();
    await startApp(quiet);
    expect(quiet.releases.fetchJson).not.toHaveBeenCalled();
    const f = fakes();
    f.releases.policy = 'notify';
    await startApp(f);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.releases.showNotice).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('YapYap 0.2.0 is available'),
      'https://github.com/vascoguita/yapyap/releases/tag/v0.2.0',
    );
  });

  it('starts self-updates only for builds that can update themselves', async () => {
    const quiet = fakes();
    await startApp(quiet);
    expect(quiet.selfUpdate.updater).not.toHaveBeenCalled();
    const f = fakes();
    f.releases.policy = 'self-update';
    await startApp(f);
    expect(f.selfUpdate.instance.checkForUpdates).toHaveBeenCalledOnce();
    expect(f.selfUpdate.instance.autoInstallOnAppQuit).toBe(false);
  });

  it('puts YapYap in the tray, whose menu quits it', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.tray.create).toHaveBeenCalledOnce();
    const [template] = f.tray.buildMenu.mock.calls[0] as [{ click?: () => void }[]];
    template[2]?.click?.();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('shows the unread count from the page title as the app badge', async () => {
    const f = fakes();
    await startApp(f);
    for (const [event, listener] of f.window.on.mock.calls as [string, unknown][]) {
      if (event === 'page-title-updated') {
        (listener as (event: { preventDefault(): void }, title: string) => void)(
          { preventDefault: vi.fn() },
          '(3) WhatsApp',
        );
      }
    }
    expect(f.badge.setBadgeCount).toHaveBeenCalledWith(3);
  });

  it('stays hidden when started minimized', async () => {
    const f = fakes();
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      general: { ...settings.general, startMinimized: true },
    });
    await startApp(f);
    f.listeners.get('ready-to-show')?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.window.show).not.toHaveBeenCalled();
  });

  it('leaves the launch to the running YapYap when another one holds the lock', async () => {
    const f = fakes();
    f.app.requestSingleInstanceLock.mockReturnValueOnce(false);
    await startApp(f);
    expect(f.app.quit).toHaveBeenCalledOnce();
    expect(f.app.whenReady).not.toHaveBeenCalled();
    expect(f.createWindow).not.toHaveBeenCalled();
    expect(f.crashes.files.write).not.toHaveBeenCalled();
  });

  it('marks the session as running until a clean quit', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.stored.get('running.json')).toMatch(/^\{"version":"0\.1\.0","startedAt":\d+\}$/);
    f.listeners.get('will-quit')?.();
    expect(f.stored.has('running.json')).toBe(false);
    expect(f.crashes.review).not.toHaveBeenCalled();
  });

  it('offers to review a crash report after an unclean exit when asked to', async () => {
    const f = fakes();
    f.stored.set('running.json', '{"version":"0.0.9","startedAt":1000}');
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      privacy: { ...settings.privacy, crashReports: 'ask' },
    });
    await startApp(f);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.crashes.review).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/YapYap 0\.0\.9[\s\S]*YapYap 0\.1\.0 \(deb\)[\s\S]*last line$/),
    );
  });

  it('logs a crash review it could not offer', async () => {
    const f = fakes();
    f.stored.set('running.json', '{"version":"0.0.9","startedAt":1000}');
    const settings = defaultSettings();
    f.settings.current = () => ({
      ...settings,
      privacy: { ...settings.privacy, crashReports: 'ask' },
    });
    f.crashes.review.mockRejectedValueOnce(new Error('no display'));
    await startApp(f);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.warn).toHaveBeenCalledWith('Could not offer the crash report.');
  });

  it('opens a chat link it was launched with', async () => {
    const f = fakes({}, ['/opt/YapYap/yapyap', 'https://wa.me/351912345678']);
    await startApp(f);
    expect(f.window.loadURL).toHaveBeenCalledExactlyOnceWith(
      `${WHATSAPP_ORIGIN}/send?phone=351912345678`,
    );
  });

  it('focuses the window and opens the chat link when YapYap is launched again', async () => {
    const f = fakes();
    await startApp(f);
    const secondInstance = f.listeners.get('second-instance') as unknown as (
      event: unknown,
      argv: readonly string[],
    ) => void;
    secondInstance({}, ['/opt/YapYap/yapyap', 'whatsapp://send?text=Hi']);
    expect(f.window.focus).toHaveBeenCalledOnce();
    expect(f.window.loadURL).toHaveBeenLastCalledWith(`${WHATSAPP_ORIGIN}/send?text=Hi`);
  });

  it('reopens the window where it was left and quits on termination signals', async () => {
    const f = fakes();
    const bounds = { x: 10, y: 20, width: 900, height: 600 };
    f.windowState.read.mockReturnValueOnce(
      JSON.stringify({ bounds, maximized: true, fullScreen: false }),
    );
    await startApp(f);
    expect(f.createWindow).toHaveBeenCalledWith(expect.objectContaining(bounds));
    expect(f.window.maximize).toHaveBeenCalledOnce();
    const [[, quitOnSignal]] = f.shutdown.onSignal.mock.calls as unknown as [[string, () => void]];
    quitOnSignal();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('refuses to start without the sandbox, explaining why, and opens nothing', async () => {
    const f = { ...fakes(), sandboxDisabled: true };
    await startApp(f);
    expect(f.logError).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/cannot start safely/),
    );
    expect(f.explainUnsafeStart).toHaveBeenCalledOnce();
    expect(f.app.quit).toHaveBeenCalledOnce();
    expect(f.app.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(f.app.enableSandbox).not.toHaveBeenCalled();
    expect(f.createWindow).not.toHaveBeenCalled();
  });

  it('takes over WhatsApp downloads once ready', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.session.on).toHaveBeenCalledWith('will-download', expect.any(Function));
  });

  it('follows the theme setting once ready', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.nativeTheme.themeSource).toBe('system');
    expect(f.settings.onChange).toHaveBeenCalled();
  });

  it('starts without hardware acceleration in safe mode and says so', async () => {
    const f = fakes({}, ['/opt/YapYap/yapyap', '--safe-mode']);
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(f.app.commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      'disable-accelerated-video-decode',
    );
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'YapYap started in safe mode, without hardware acceleration.',
    );
  });

  it('tells the user when repeated GPU crashes turned acceleration off', async () => {
    const f = fakes();
    const now = Date.now();
    f.gpuCrashLog.read = () => JSON.stringify([now - 3, now - 2, now - 1]);
    await startApp(f);
    expect(f.app.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      'Graphics kept crashing, so YapYap started without hardware acceleration this time.',
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
