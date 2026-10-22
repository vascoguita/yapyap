import type { MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { ViewInfo } from '../views.ts';
import {
  CHROME_PARTITION,
  createChromeFeature,
  type ChromeFeatureDependencies,
} from './feature.ts';
import type { IpcInvokeEvent } from './ipc.ts';

type Listener = (event: IpcInvokeEvent, ...args: unknown[]) => unknown;

function setup() {
  const listeners = new Map<string, Listener>();
  const window = {
    webContents: {},
    isDestroyed: () => false,
    focus: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  let handler: ((request: { url: string }) => Promise<Response>) | undefined;
  let menu: MenuItemConstructorOptions[] = [];
  const deps = {
    registerSchemesAsPrivileged: vi.fn(),
    chromeProtocol: vi.fn(() => ({
      handle: vi.fn((_scheme: string, h: typeof handler) => {
        handler = h;
      }),
    })),
    ipc: {
      handle: vi.fn((channel: string, listener: Listener) => {
        listeners.set(channel, listener);
      }),
    },
    createWindow: vi.fn(() => window),
    setMenu: vi.fn((template: MenuItemConstructorOptions[]) => {
      menu = template;
    }),
    writeClipboard: vi.fn(() => Promise.resolve()),
    notify: vi.fn(),
    facts: () => ({
      version: '0.1.0',
      channel: 'deb',
      versions: { electron: '44.9.0', chrome: '152', node: '24.22.0' },
      platform: 'linux',
      release: '7.0.0',
      arch: 'x64',
    }),
    platform: 'linux',
    rendererRoot: '/app/renderer',
    preloadPath: '/app/preload/chrome.cjs',
    readFile: vi.fn(() => Promise.resolve(new Uint8Array([60]))),
    settings: {
      current: defaultSettings,
      notice: undefined,
      readOnly: false,
      update: vi.fn(),
      onChange: vi.fn(),
    },
    settingsFiles: {
      chooseExport: vi.fn(() => Promise.resolve(undefined)),
      chooseImport: vi.fn(() => Promise.resolve(undefined)),
      confirmImport: vi.fn(() => Promise.resolve(false)),
      read: vi.fn(() => Promise.resolve('')),
      write: vi.fn(() => Promise.resolve()),
    },
    restart: vi.fn(),
    gpuStatus: () => ({ gpu_compositing: 'enabled', webgl: 'enabled_on' }),
    recentLog: () => ['2026-10-21T12:00:00.000Z warn Something happened'],
    confirmReset: vi.fn(() => Promise.resolve(true)),
    captureSources: vi.fn<ChromeFeatureDependencies['captureSources']>(() => Promise.resolve([])),
    windowOf: vi.fn<ChromeFeatureDependencies['windowOf']>(() => null),
  } satisfies ChromeFeatureDependencies;
  const views = new WeakMap<object, ViewInfo>();
  const feature = createChromeFeature(deps);
  const call = (channel: string, sender: object = window.webContents) =>
    listeners.get(channel)?.({
      sender,
      senderFrame: { url: 'app://chrome/about.html' },
    });
  const click = (menuIndex: number) => (): void => {
    const submenu = menu.at(menuIndex)?.submenu;
    const item = Array.isArray(submenu) ? submenu[0] : undefined;
    (item?.click as (() => void) | undefined)?.();
  };
  return {
    deps,
    feature,
    views,
    window,
    call,
    clickAbout: click(-1),
    clickSettings: click(0),
    clickAccount: (index: number) => {
      const submenu = menu[1]?.submenu;
      const item = Array.isArray(submenu) ? submenu[index] : undefined;
      (item?.click as (() => void) | undefined)?.();
    },
    handler: () => handler,
    menu: () => menu,
  };
}

describe('createChromeFeature', () => {
  it('registers app: as a standard, secure scheme before the app is ready', () => {
    const t = setup();
    t.feature.beforeReady();
    expect(t.deps.registerSchemesAsPrivileged).toHaveBeenCalledExactlyOnceWith([
      { scheme: 'app', privileges: { standard: true, secure: true } },
    ]);
  });

  it('serves the renderer folder on the chrome session', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const response = await t.handler()?.({ url: 'app://chrome/about.html' });
    expect(response?.status).toBe(200);
    expect(t.deps.readFile).toHaveBeenCalledWith(join('/app/renderer', 'about.html'));
  });

  it('opens About from the menu as a chrome window with the chrome preload and partition', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickAbout();
    expect(t.deps.createWindow).toHaveBeenCalledWith(
      {
        autoHideMenuBar: true,
        title: 'About YapYap',
        width: 480,
        height: 640,
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: false,
      },
      {
        preload: '/app/preload/chrome.cjs',
        partition: CHROME_PARTITION,
      },
    );
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/about.html');
    expect(t.views.get(t.window.webContents)?.zone).toBe('chrome');
  });

  it('answers About IPC calls from the About window', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickAbout();
    expect(t.call('about:info')).toEqual(
      expect.objectContaining({ version: '0.1.0', channel: 'deb' }),
    );
    await t.call('about:copy-technical-details');
    expect(t.deps.writeClipboard).toHaveBeenCalledExactlyOnceWith(
      'YapYap 0.1.0 (deb)\nElectron 44.9.0\nChromium 152\nNode.js 24.22.0\nOS linux 7.0.0 (x64)\nGraphics hardware accelerated',
    );
  });

  it('opens Settings from the menu and answers its IPC calls', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickSettings();
    expect(t.deps.createWindow).toHaveBeenCalledWith(
      {
        autoHideMenuBar: true,
        title: 'YapYap Settings',
        width: 640,
        height: 680,
        minWidth: 420,
        minHeight: 360,
        show: false,
      },
      { preload: '/app/preload/chrome.cjs', partition: CHROME_PARTITION },
    );
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/settings.html');
    expect(t.call('settings:get')).toEqual({
      values: {
        'appearance.theme': 'system',
        'appearance.autoHideMenuBar': false,
        'reliability.hardwareAcceleration': true,
        'reliability.displayBackend': 'auto',
        'reliability.hardwareVideoDecoding': true,
        'privacy.crashReports': 'off',
      },
      restartPending: false,
      readOnly: false,
    });
    t.call('settings:restart');
    expect(t.deps.restart).toHaveBeenCalledOnce();
    await expect(t.call('settings:export')).resolves.toEqual({ outcome: 'cancelled', message: '' });
    await expect(t.call('settings:import')).resolves.toEqual({ outcome: 'cancelled', message: '' });
    expect(t.deps.settingsFiles.chooseExport).toHaveBeenCalledWith(t.window.webContents);
  });

  it('opens the screen-sharing picker over the requesting window and settles through IPC', async () => {
    const t = setup();
    const parent = {};
    t.deps.windowOf.mockReturnValueOnce(parent as never);
    const source = { id: 'screen:1:0', name: 'Screen', thumbnail: { toDataURL: () => 'data:' } };
    t.deps.captureSources.mockResolvedValueOnce([source]);
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const owner = {};
    const choice = runtime.pickCaptureSource(owner);
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.windowOf).toHaveBeenCalledWith(owner);
    expect(t.deps.createWindow).toHaveBeenCalledWith(
      {
        autoHideMenuBar: true,
        title: 'Share your screen',
        width: 760,
        height: 580,
        minWidth: 480,
        minHeight: 400,
        minimizable: false,
        modal: true,
        parent,
        show: false,
      },
      { preload: '/app/preload/chrome.cjs', partition: CHROME_PARTITION },
    );
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/picker.html');
    expect(t.window.once).toHaveBeenCalledWith('closed', expect.any(Function));
    expect(t.call('picker:offer')).toEqual({
      sources: [{ id: 'screen:1:0', name: 'Screen', kind: 'screen', thumbnail: 'data:' }],
      offerAudio: false,
    });
    t.call('picker:cancel');
    expect(await choice).toBeUndefined();
    expect(t.window.close).toHaveBeenCalledOnce();
  });

  it('never closes a picker window that is already destroyed', async () => {
    const t = setup();
    t.deps.captureSources.mockResolvedValueOnce([
      { id: 'screen:1:0', name: 'Screen', thumbnail: { toDataURL: () => 'data:' } },
    ]);
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const choice = runtime.pickCaptureSource({});
    await new Promise((resolve) => setTimeout(resolve));
    t.window.isDestroyed = () => true;
    t.call('picker:cancel');
    expect(await choice).toBeUndefined();
    expect(t.window.close).not.toHaveBeenCalled();
  });

  it('waits between attempts when the system lists no sources at first', async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.deps.captureSources.mockResolvedValueOnce([]);
      const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
      void runtime.pickCaptureSource({});
      await vi.advanceTimersByTimeAsync(199);
      expect(t.deps.captureSources.mock.calls).toEqual([['screen'], ['window']]);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.deps.captureSources).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the picker as a plain window when the requester has none', async () => {
    const t = setup();
    t.deps.captureSources.mockResolvedValueOnce([
      { id: 'screen:1:0', name: 'Screen', thumbnail: { toDataURL: () => 'data:' } },
    ]);
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    void runtime.pickCaptureSource({});
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.createWindow.mock.lastCall).not.toHaveProperty(['0', 'parent']);
  });

  it('clears the cache or, once confirmed, resets the session of the WhatsApp view', async () => {
    const t = setup();
    const warn = vi.fn();
    const runtime = t.feature.afterReady(t.views, warn, 'hardware accelerated');
    t.clickAccount(0);
    t.clickAccount(2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.confirmReset).toHaveBeenCalledOnce();
    const session = {
      clearCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
    };
    const contents = {
      on: vi.fn(),
      executeJavaScriptInIsolatedWorld: vi.fn(),
      reload: vi.fn(),
      forcefullyCrashRenderer: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      session,
    };
    runtime.attachRecovery(contents, 'https://web.whatsapp.com', vi.fn());
    t.clickAccount(0);
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenLastCalledWith({
      storages: ['serviceworkers', 'cachestorage'],
    });
    t.deps.confirmReset.mockResolvedValueOnce(false);
    t.clickAccount(2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenCalledOnce();
    t.clickAccount(2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenLastCalledWith();
    expect(contents.loadURL).toHaveBeenCalledTimes(2);
    session.clearCache.mockRejectedValueOnce(new Error('busy'));
    t.clickAccount(0);
    await new Promise((resolve) => setTimeout(resolve));
    expect(warn).toHaveBeenCalledWith('Could not finish an account maintenance action.');
  });

  it('zooms through the settings from the View menu', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const view = t.menu().find((menu) => menu.label === '&View');
    const zoomIn = Array.isArray(view?.submenu)
      ? view.submenu.find((item) => item.label === 'Zoom In')
      : undefined;
    (zoomIn?.click as (() => void) | undefined)?.();
    expect(t.deps.settings.update).toHaveBeenCalledOnce();
  });

  it('gives crash reports the About window’s technical details', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    expect(runtime.technicalDetails()).toMatch(
      /^YapYap 0\.1\.0 \(deb\)\n[\s\S]*\nGraphics hardware accelerated$/,
    );
  });

  it('copies diagnostics with the GPU summary and recent log from the Help menu', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const help = t.menu().at(-1)?.submenu;
    const copy = Array.isArray(help)
      ? help.find((item) => item.label === 'Copy Diagnostics')
      : undefined;
    (copy?.click as (() => void) | undefined)?.();
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.writeClipboard).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /^YapYap 0\.1\.0 \(deb\)\n[\s\S]*\nGPU gpu_compositing=enabled, rasterization=unknown, video_decode=unknown, webgl=enabled_on\nWhatsApp page unavailable \(landmarks v1\)\n\nRecent log:\n2026-10-21T12:00:00\.000Z warn Something happened$/,
      ),
    );
  });

  it('describes the first WhatsApp view in the diagnostics', async () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const contents = {
      on: vi.fn(),
      executeJavaScriptInIsolatedWorld: vi.fn(() =>
        Promise.resolve({ view: 'chats', chatOpen: true, unread: 4 }),
      ),
      reload: vi.fn(),
      forcefullyCrashRenderer: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      session: {
        clearCache: vi.fn(() => Promise.resolve()),
        clearStorageData: vi.fn(() => Promise.resolve()),
      },
    };
    runtime.attachRecovery(contents, 'https://web.whatsapp.com', vi.fn());
    const help = t.menu().at(-1)?.submenu;
    const copy = Array.isArray(help)
      ? help.find((item) => item.label === 'Copy Diagnostics')
      : undefined;
    (copy?.click as (() => void) | undefined)?.();
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.writeClipboard).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '\nWhatsApp view=chats, chat_open=true (landmarks v1)\n\nRecent log:',
      ),
    );
  });

  it('logs diagnostics it could not copy', async () => {
    const t = setup();
    const warn = vi.fn();
    t.deps.writeClipboard.mockRejectedValueOnce(new Error('denied'));
    t.feature.afterReady(t.views, warn, 'hardware accelerated');
    const help = t.menu().at(-1)?.submenu;
    const copy = Array.isArray(help)
      ? help.find((item) => item.label === 'Copy Diagnostics')
      : undefined;
    (copy?.click as (() => void) | undefined)?.();
    await new Promise((resolve) => setTimeout(resolve));
    expect(warn).toHaveBeenCalledWith('Could not copy the diagnostics.');
  });

  it('keeps chrome storage in memory', () => {
    expect(CHROME_PARTITION).toBe('yapyap-chrome');
  });

  it('shows the recovery screen over a failing WhatsApp view and routes its actions to it', async () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const handlers = new Map<string, (...args: never[]) => void>();
    const contents = {
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        handlers.set(event, listener);
      }),
      executeJavaScriptInIsolatedWorld: vi.fn(),
      reload: vi.fn(),
      forcefullyCrashRenderer: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      session: {
        clearCache: vi.fn(() => Promise.resolve()),
        clearStorageData: vi.fn(() => Promise.resolve()),
      },
    };
    const overlay = { webContents: { loadURL: vi.fn(() => Promise.resolve()) }, remove: vi.fn() };
    const createOverlay = vi.fn(() => overlay);
    runtime.attachRecovery(contents, 'https://web.whatsapp.com', createOverlay);
    handlers.get('did-fail-load')?.(
      ...([{}, -106, 'ERR_INTERNET_DISCONNECTED', 'https://web.whatsapp.com/', true] as never[]),
    );
    expect(createOverlay).toHaveBeenCalledExactlyOnceWith({
      preload: '/app/preload/chrome.cjs',
      partition: CHROME_PARTITION,
    });
    expect(t.call('recovery:problem', overlay.webContents)).toEqual({
      kind: 'load-failed',
      description: 'WhatsApp could not load (ERR_INTERNET_DISCONNECTED, -106).',
    });
    await t.call('recovery:copy-diagnostics', overlay.webContents);
    expect(t.deps.writeClipboard).toHaveBeenLastCalledWith(
      expect.stringMatching(/^YapYap 0\.1\.0 \(deb\)\n[\s\S]*Problem: WhatsApp could not load/),
    );
    await t.call('recovery:clear-cache', overlay.webContents);
    expect(contents.session.clearCache).toHaveBeenCalledOnce();
    handlers.get('did-fail-load')?.(
      ...([{}, -106, 'ERR', 'https://web.whatsapp.com/', true] as never[]),
    );
    await t.call('recovery:retry', overlay.webContents);
    expect(contents.loadURL).toHaveBeenCalledTimes(2);
    expect(() => t.call('recovery:problem', overlay.webContents)).toThrow(
      'No recovery screen belongs to this window.',
    );
  });

  it('refuses recovery calls from chrome views that are not a recovery screen', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickAbout();
    expect(() => t.call('recovery:retry')).toThrow('No recovery screen belongs to this window.');
  });
});
