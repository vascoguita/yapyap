import type { MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import type { ViewInfo } from '../security/views.ts';
import {
  CHROME_PARTITION,
  createChromeFeature,
  type ChromeFeatureDependencies,
} from './feature.ts';
import type { IpcInvokeEvent } from '../ipc/chrome.ts';

type Listener = (event: IpcInvokeEvent, ...args: unknown[]) => unknown;

function setup() {
  const listeners = new Map<string, Listener>();
  const window = {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
    focus: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    setPosition: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 260, height: 360 })),
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
    recordTrace: vi.fn(),
    openExternal: vi.fn(() => Promise.resolve()),
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
      firstRun: false,
      update: vi.fn(),
      onChange: vi.fn(),
    },
    settingEffects: {},
    hiddenSettings: [],
    assistant: {
      fetch: vi.fn(),
      chats: {
        isAllowed: () => false,
        allow: vi.fn(),
        forget: vi.fn(),
        forgetAccount: vi.fn(),
        list: () => Promise.resolve([]),
      },
      keys: {
        get: () => Promise.resolve(undefined),
        save: vi.fn(),
        forget: vi.fn(),
        canKeep: () => Promise.resolve(true),
      },
      findServers: () => Promise.resolve([]),
    },
    spelling: {
      available: () => ['en-GB', 'pt-PT'],
      system: () => ['en-GB'],
      dictionaries: {
        folder: '/profile/Dictionaries',
        watch: vi.fn(),
        states: () => Promise.resolve({}),
        unused: () => Promise.resolve([]),
        removeUnused: () => Promise.resolve(),
        retry: vi.fn(),
      },
      open: vi.fn(() => Promise.resolve('')),
    },
    chooseFolder: vi.fn(() => Promise.resolve<string | undefined>(undefined)),
    isGlobalShortcutRegistered: vi.fn(() => true),
    customCode: { attach: vi.fn(), current: vi.fn(), save: vi.fn(), preview: vi.fn() },
    downloads: { add: vi.fn(), entries: vi.fn(() => []), act: vi.fn(() => true), clear: vi.fn() },
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
    installEvidence: () => ({
      platform: 'linux',
      env: {},
      flatpakInfo: false,
      developerIdSigned: false,
    }),
    confirmLogOut: vi.fn(() => Promise.resolve(true)),
    confirmRemoveAccount: vi.fn(() => Promise.resolve(true)),
    captureSources: vi.fn<ChromeFeatureDependencies['captureSources']>(() => Promise.resolve([])),
    windowOf: vi.fn<ChromeFeatureDependencies['windowOf']>(() => null),
    agents: {
      tokens: {
        create: vi.fn(() => Promise.resolve('')),
        verify: vi.fn(() => undefined),
        list: vi.fn(() => Promise.resolve([])),
        count: vi.fn(() => 0),
        revoke: vi.fn(),
        narrow: vi.fn(() => false),
        listed: vi.fn(() => Promise.resolve('all' as const)),
      },
      serve: vi.fn(() => Promise.reject(new Error('Not in this test.'))),
      now: () => 0,
      version: '1.0.0',
    },
  } satisfies ChromeFeatureDependencies;
  const views = new WeakMap<object, ViewInfo>();
  const feature = createChromeFeature(deps);
  const call = (channel: string, sender: object = window.webContents, ...args: unknown[]) =>
    listeners.get(channel)?.(
      {
        sender,
        senderFrame: { url: 'app://chrome/about.html' },
      },
      ...args,
    );
  // Finds an item by its label in any menu, submenus included.
  const clickItem = (label: string): void => {
    interface Item {
      readonly label?: string;
      readonly click?: unknown;
      readonly submenu?: unknown;
    }
    const within = (items: unknown): Item[] =>
      Array.isArray(items)
        ? (items as Item[]).flatMap((entry) => [entry, ...within(entry.submenu)])
        : [];
    const item = within(menu).find((candidate) => candidate.label === label);
    (item?.click as (() => void) | undefined)?.();
  };
  // Electron hands a menu item's handler the item itself, which must not reach the window.
  const click = (menuIndex: number) => (): void => {
    const submenu = menu.at(menuIndex)?.submenu;
    const item = Array.isArray(submenu) ? submenu[0] : undefined;
    (item?.click as ((clicked: unknown) => void) | undefined)?.(item);
  };
  return {
    deps,
    feature,
    views,
    window,
    call,
    clickAbout: click(-1),
    clickSettings: () => {
      clickItem('Settings…');
    },
    clickItem,
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
        width: 440,
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

  it('builds the menu again when the user changes a shortcut, and only then', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const listeners = t.deps.settings.onChange.mock.calls.map(
      ([listener]) => listener as (settings: Settings) => void,
    );
    const builds = t.deps.setMenu.mock.calls.length;
    const settings = defaultSettings();
    for (const listener of listeners) {
      listener(settings);
    }
    expect(t.deps.setMenu).toHaveBeenCalledTimes(builds);
    const custom = {
      ...settings,
      shortcuts: { ...settings.shortcuts, custom: { settings: 'Alt+S' } },
    };
    for (const listener of listeners) {
      listener(custom);
    }
    expect(t.deps.setMenu).toHaveBeenCalledTimes(builds + 1);
  });

  it('opens Settings at its shortcuts from Help, listing those of this platform', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const help = t.menu().find((menu) => menu.role === 'help');
    const open = Array.isArray(help?.submenu)
      ? help.submenu.find((item) => item.label === 'Keyboard Shortcuts…')
      : undefined;
    (open?.click as (() => void) | undefined)?.();
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/settings.html#shortcuts');
    const list = t.call('shortcuts:list') as { platform: string; shortcuts: { id: string }[] };
    expect(list.platform).toBe(t.deps.platform);
    expect(list.shortcuts.map((shortcut) => shortcut.id)).toContain('settings');
  });

  it('gives each of YapYap’s windows its own size and controls', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const clickLabel = (label: string): void => {
      const item = t
        .menu()
        .flatMap((menu) => (Array.isArray(menu.submenu) ? menu.submenu : []))
        .find((entry) => entry.label === label);
      (item?.click as ((clicked: unknown) => void) | undefined)?.(item);
    };
    const lastOptions = (): unknown =>
      (t.deps.createWindow.mock.lastCall as unknown[] | undefined)?.[0];
    const fixed = { resizable: false, minimizable: false, maximizable: false };
    clickLabel('About YapYap');
    expect(lastOptions()).toEqual({
      autoHideMenuBar: true,
      title: 'About YapYap',
      width: 440,
      height: 640,
      ...fixed,
      show: false,
    });
    clickLabel('Custom CSS and JavaScript…');
    expect(lastOptions()).toEqual({
      autoHideMenuBar: true,
      title: 'Custom CSS and JavaScript',
      width: 600,
      height: 640,
      minWidth: 440,
      minHeight: 400,
      minimizable: false,
      show: false,
    });
    clickLabel('Manage Accounts…');
    expect(lastOptions()).toEqual({
      autoHideMenuBar: true,
      title: 'Accounts',
      width: 820,
      height: 640,
      minWidth: 600,
      minHeight: 480,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    clickLabel('Downloads…');
    expect(lastOptions()).toEqual({
      autoHideMenuBar: true,
      title: 'Downloads',
      width: 600,
      height: 640,
      minWidth: 440,
      minHeight: 400,
      minimizable: false,
      show: false,
    });
    runtime.openWelcome();
    expect(lastOptions()).toEqual({
      autoHideMenuBar: true,
      title: 'Welcome',
      width: 600,
      height: 640,
      minWidth: 440,
      minHeight: 400,
      minimizable: false,
      maximizable: false,
      show: false,
    });
  });

  it('asks for a proxy password in a window of its own', async () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const request = { host: 'proxy.example.org', port: 3128, failed: false, canRemember: true };
    const asked = runtime.askProxyLogin(request);
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/proxy-login.html');
    expect(t.deps.createWindow).toHaveBeenLastCalledWith(
      {
        autoHideMenuBar: true,
        title: 'Sign In to the Proxy',
        width: 440,
        height: 480,
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: false,
      },
      expect.anything(),
    );
    expect(t.call('proxy-login:request')).toEqual(request);
    t.call('proxy-login:answer', t.window.webContents, null);
    await expect(asked).resolves.toBeUndefined();
  });

  it('opens Settings from the menu and answers its IPC calls', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickSettings();
    expect(t.deps.createWindow).toHaveBeenCalledWith(
      {
        autoHideMenuBar: true,
        title: 'YapYap Settings',
        width: 820,
        height: 640,
        minWidth: 600,
        minHeight: 480,
        show: false,
      },
      { preload: '/app/preload/chrome.cjs', partition: CHROME_PARTITION },
    );
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/settings.html');
    expect(t.call('settings:get')).toEqual({
      values: {
        'assistant.enabled': true,
        'assistant.provider': 'none',
        'assistant.model': 'auto',
        'assistant.autoSuggest': true,
        'assistant.chats': 'chosen',
        'assistant.messages': '50',
        'assistant.server': '',
        'agents.enabled': false,
        'appearance.theme': 'system',
        'appearance.autoHideMenuBar': false,
        'appearance.zoom': 1,
        'appearance.compactSidebar': false,
        'appearance.trayIcon': 'color',
        'reliability.hardwareAcceleration': true,
        'reliability.displayBackend': 'auto',
        'reliability.hardwareVideoDecoding': true,
        'reliability.diskCacheMb': 'auto',
        'reliability.jsHeapMb': 'auto',
        'privacy.crashReports': 'off',
        'privacy.unreadWhileHidden': true,
        'privacy.notificationSender': true,
        'privacy.notificationText': true,
        'privacy.blurWhenUnfocused': false,
        'privacy.blurWhenIdle': false,
        'network.proxyMode': 'system',
        'network.proxyServer': '',
        'downloads.askWhere': false,
        'downloads.openWhenDone': false,
        'downloads.folder': '',
        'spelling.enabled': false,
        'general.autostart': false,
        'general.startMinimized': false,
        'general.betaUpdates': false,
        'general.doNotDisturb': false,
        'general.closeToTray': false,
      },
      restartPending: false,
      platform: 'linux',
      problems: {},
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
        title: 'Choose What to Share',
        width: 820,
        height: 640,
        minWidth: 600,
        minHeight: 480,
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

  it('offers to share system audio only on Windows, where Chromium can capture it', async () => {
    const t = setup();
    const windows = { ...t.deps, platform: 'win32' };
    t.deps.captureSources.mockResolvedValueOnce([
      { id: 'screen:1:0', name: 'Screen', thumbnail: { toDataURL: () => 'data:' } },
    ]);
    const runtime = createChromeFeature(windows).afterReady(
      t.views,
      vi.fn(),
      'hardware accelerated',
    );
    const choice = runtime.pickCaptureSource({});
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.call('picker:offer')).toHaveProperty('offerAudio', true);
    t.call('picker:cancel');
    expect(await choice).toBeUndefined();
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

  it('reloads, clears the cache or, once confirmed, logs out the WhatsApp view', async () => {
    const t = setup();
    const warn = vi.fn();
    const runtime = t.feature.afterReady(t.views, warn, 'hardware accelerated');
    t.clickItem('Reload');
    t.clickItem('Clear Cache and Reload');
    t.clickItem('Log Out and Delete Data…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.confirmLogOut).toHaveBeenCalledOnce();
    // Before WhatsApp loaded, there is no session to act on, and nothing goes wrong.
    expect(warn).not.toHaveBeenCalled();
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
    runtime.setAccountMenu({
      entries: [
        {
          id: 'a',
          name: 'WhatsApp',
          color: 'green',
          enabled: true,
          muted: false,
          proxy: '',
          active: true,
        },
      ],
      activeContents: () => contents,
      insertDraft: vi.fn(() => Promise.resolve(true)),
      readActiveChat: vi.fn(() => Promise.resolve(null)),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      readDraft: vi.fn(() => Promise.resolve(null)),
      agentPage: vi.fn(() => undefined),
      switchTo: vi.fn(),
      add: vi.fn(),
      privacyScreen: false,
      togglePrivacyScreen: vi.fn(),
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    });
    t.clickItem('Reload');
    await new Promise((resolve) => setTimeout(resolve));
    expect(contents.loadURL).toHaveBeenCalledOnce();
    expect(session.clearCache).not.toHaveBeenCalled();
    t.clickItem('Clear Cache and Reload');
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenLastCalledWith({
      storages: ['serviceworkers', 'cachestorage'],
    });
    t.deps.confirmLogOut.mockResolvedValueOnce(false);
    t.clickItem('Log Out and Delete Data…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenCalledOnce();
    t.clickItem('Log Out and Delete Data…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(session.clearStorageData).toHaveBeenLastCalledWith();
    expect(contents.loadURL).toHaveBeenCalledTimes(3);
    session.clearCache.mockRejectedValueOnce(new Error('busy'));
    t.clickItem('Clear Cache and Reload');
    await new Promise((resolve) => setTimeout(resolve));
    expect(warn).toHaveBeenCalledWith('Could not finish an account maintenance action.');
  });

  it('lists the accounts, and removes the active one once the user agrees', async () => {
    const t = setup();
    const warn = vi.fn();
    const runtime = t.feature.afterReady(t.views, warn, 'hardware accelerated');
    t.clickItem('Add Account');
    t.clickItem('Remove Account…');
    expect(t.deps.confirmRemoveAccount).not.toHaveBeenCalled();
    const menu = {
      entries: [
        {
          id: 'a',
          name: 'Personal',
          color: 'green',
          enabled: true,
          muted: false,
          proxy: '',
          active: false,
        },
        {
          id: 'b',
          name: 'Work',
          color: 'blue',
          enabled: true,
          muted: false,
          proxy: '',
          active: true,
        },
      ],
      activeContents: () => ({}),
      insertDraft: vi.fn(() => Promise.resolve(true)),
      readActiveChat: vi.fn(() => Promise.resolve(null)),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      readDraft: vi.fn(() => Promise.resolve(null)),
      agentPage: vi.fn(() => undefined),
      switchTo: vi.fn(),
      add: vi.fn(),
      privacyScreen: false,
      togglePrivacyScreen: vi.fn(),
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    };
    t.clickItem('Manage Accounts…');
    expect(await t.call('agents:view')).toMatchObject({ accounts: [] });
    runtime.setAccountMenu(menu);
    expect(await t.call('agents:view')).toMatchObject({
      address: null,
      accounts: [
        { id: 'a', name: 'Personal' },
        { id: 'b', name: 'Work' },
      ],
    });
    expect(await t.call('agents:open-chat', undefined, 'a')).toBeNull();
    expect(menu.agentPage).toHaveBeenCalledWith('a');
    t.clickItem('Personal');
    expect(menu.switchTo).toHaveBeenCalledWith('a');
    t.clickItem('Add Account');
    expect(menu.add).toHaveBeenCalledOnce();
    t.deps.confirmRemoveAccount.mockResolvedValueOnce(false);
    t.clickItem('Remove Account…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(menu.remove).not.toHaveBeenCalled();
    t.clickItem('Remove Account…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(t.deps.confirmRemoveAccount).toHaveBeenLastCalledWith('Work');
    expect(menu.remove).toHaveBeenCalledExactlyOnceWith('b');
    t.deps.confirmRemoveAccount.mockRejectedValueOnce(new Error('no dialog'));
    t.clickItem('Remove Account…');
    await new Promise((resolve) => setTimeout(resolve));
    expect(warn).toHaveBeenCalledWith('Could not finish an account maintenance action.');
  });

  it('opens the welcome in its own window, once', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    runtime.openWelcome();
    runtime.openWelcome();
    expect(t.window.loadURL).toHaveBeenCalledExactlyOnceWith('app://chrome/welcome.html');
  });

  it('opens Report a Problem from the Help menu, describing the first WhatsApp view', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const help = t.menu().at(-1)?.submenu;
    const report = Array.isArray(help)
      ? help.find((item) => item.label === 'Report a Problem…')
      : undefined;
    (report?.click as (() => void) | undefined)?.();
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/report.html');
    expect(t.deps.createWindow).toHaveBeenLastCalledWith(
      {
        autoHideMenuBar: true,
        title: 'Report a Problem',
        width: 600,
        height: 640,
        minWidth: 440,
        minHeight: 400,
        minimizable: false,
        show: false,
      },
      expect.anything(),
    );
    await expect(t.call('report:diagnostics')).resolves.toMatch(/WhatsApp page unavailable/);
  });

  it('docks the account sidebar as a chrome page and answers its calls', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const port = {
      webContents: { loadURL: vi.fn(() => Promise.resolve()), send: vi.fn() },
      setWidth: vi.fn(),
    };
    const create = vi.fn(() => port);
    const show = runtime.attachSidebar(create);
    expect(create).toHaveBeenCalledWith({
      preload: '/app/preload/chrome.cjs',
      partition: 'yapyap-chrome',
    });
    const entry = {
      name: 'A',
      color: 'green',
      unread: 0,
      muted: false,
      proxy: '',
      active: true,
      sharing: false,
      avatar: undefined,
    };
    const state = {
      accounts: [
        { ...entry, id: 'a' },
        { ...entry, id: 'b', active: false },
      ],
      compact: false,
      doNotDisturb: false,
    };
    show({ state, switchTo: vi.fn(), stopSharing: vi.fn() });
    expect(port.setWidth).toHaveBeenCalledWith(220);
    expect(t.call('sidebar:state', port.webContents)).toBe(state);
  });

  it('gives the assistant bar its view, shown as the settings say', async () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const view = { show: vi.fn(), publish: vi.fn() };
    const create = vi.fn((bar: { state: () => { suggestions: readonly string[] } }) => {
      expect(bar.state()).toEqual(expect.objectContaining({ suggestions: [] }));
      return view;
    });
    runtime.attachAssistantBar(create);
    expect(create).toHaveBeenCalledOnce();
    expect(view.show).toHaveBeenLastCalledWith(true);
    t.clickAbout();
    await expect(t.call('assistant:view')).resolves.toMatchObject({ inUse: null });
  });

  it('opens Settings at the assistant’s page, which the menu leaves to Settings', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    expect(t.menu().map((entry) => entry.label ?? entry.role)).not.toContain('A&ssistant');
    runtime.openAssistantSettings();
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/settings.html#assistant');
  });

  it('opens Settings at the Spelling page, for the right-click menu’s languages', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    runtime.openSpellingSettings();
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/settings.html#spelling');
  });

  it('opens the Accounts window from the Account menu, listing the current accounts', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickItem('Manage Accounts…');
    expect(t.window.loadURL).toHaveBeenCalledWith('app://chrome/accounts.html');
    expect(t.call('accounts:list')).toHaveProperty('accounts', []);
    const scopes = () => (t.call('custom-code:get') as { scopes: { id: string }[] }).scopes;
    expect(scopes().map((scope) => scope.id)).toEqual(['all']);
    const entries = [
      {
        id: 'a',
        name: 'Personal',
        color: 'green',
        enabled: true,
        muted: false,
        proxy: '',
        active: true,
      },
    ];
    runtime.setAccountMenu({
      entries,
      activeContents: () => ({}),
      insertDraft: vi.fn(() => Promise.resolve(true)),
      readActiveChat: vi.fn(() => Promise.resolve(null)),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      readDraft: vi.fn(() => Promise.resolve(null)),
      agentPage: vi.fn(() => undefined),
      switchTo: vi.fn(),
      add: vi.fn(),
      privacyScreen: false,
      togglePrivacyScreen: vi.fn(),
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    });
    expect(t.call('accounts:list')).toHaveProperty('accounts', entries);
    expect(scopes().map((scope) => scope.id)).toEqual(['all', 'a']);
  });

  it('asks nothing when no account is on screen to remove', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    runtime.setAccountMenu({
      entries: [
        {
          id: 'a',
          name: 'Personal',
          color: 'green',
          enabled: true,
          muted: false,
          proxy: '',
          active: false,
        },
        {
          id: 'b',
          name: 'Work',
          color: 'blue',
          enabled: true,
          muted: false,
          proxy: '',
          active: false,
        },
      ],
      activeContents: () => ({}),
      insertDraft: vi.fn(() => Promise.resolve(true)),
      readActiveChat: vi.fn(() => Promise.resolve(null)),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      readDraft: vi.fn(() => Promise.resolve(null)),
      agentPage: vi.fn(() => undefined),
      switchTo: vi.fn(),
      add: vi.fn(),
      privacyScreen: false,
      togglePrivacyScreen: vi.fn(),
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    });
    t.clickItem('Remove Account…');
    expect(t.deps.confirmRemoveAccount).not.toHaveBeenCalled();
  });

  it('turns do not disturb on and mutes the account on screen from the Account menu', () => {
    const t = setup();
    const runtime = t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    t.clickItem('Do Not Disturb');
    t.clickItem('Mute This Account');
    expect(t.deps.settings.update).toHaveBeenCalledOnce();
    const work = { id: 'b', name: 'Work', color: 'blue', enabled: true, muted: false, proxy: '' };
    const menu = {
      entries: [{ ...work, color: 'pink', id: 'a', active: false }],
      activeContents: () => ({}),
      insertDraft: vi.fn(() => Promise.resolve(true)),
      readActiveChat: vi.fn(() => Promise.resolve(null)),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      readDraft: vi.fn(() => Promise.resolve(null)),
      agentPage: vi.fn(() => undefined),
      switchTo: vi.fn(),
      add: vi.fn(),
      privacyScreen: false,
      togglePrivacyScreen: vi.fn(),
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    };
    runtime.setAccountMenu(menu);
    t.clickItem('Mute This Account');
    runtime.setAccountMenu({ ...menu, entries: [{ ...work, color: 'pink', active: true }] });
    t.clickItem('Mute This Account');
    expect(menu.update).not.toHaveBeenCalled();
    runtime.setAccountMenu({ ...menu, entries: [{ ...work, active: true }] });
    t.clickItem('Mute This Account');
    expect(menu.update).toHaveBeenCalledExactlyOnceWith('b', {
      name: 'Work',
      color: 'blue',
      enabled: true,
      muted: true,
      proxy: '',
    });
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

  /** Opens Report a Problem, whose window alone may ask for the report. */
  const openReport = (t: ReturnType<typeof setup>): void => {
    const help = t.menu().at(-1)?.submenu;
    const report = Array.isArray(help)
      ? help.find((item) => item.label === 'Report a Problem…')
      : undefined;
    (report?.click as (() => void) | undefined)?.();
  };

  it('gives Report a Problem diagnostics with the GPU summary and recent log', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    openReport(t);
    await expect(t.call('report:diagnostics')).resolves.toMatch(
      /^YapYap 0\.1\.0 \(deb\)\n[\s\S]*\nGPU gpu_compositing=enabled, rasterization=unknown, video_decode=unknown, webgl=enabled_on\nUpdates system \(deb\)\nWhatsApp page unavailable \(landmarks v11\)\n\nRecent log:\n2026-10-21T12:00:00\.000Z warn Something happened$/,
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
    openReport(t);
    await expect(t.call('report:diagnostics')).resolves.toContain(
      '\nWhatsApp view=chats, chat_open=true (landmarks v11)\n\nRecent log:',
    );
  });

  it('records a performance trace from Report a Problem, which the Help menu leaves out', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn(), 'hardware accelerated');
    const help = t.menu().at(-1)?.submenu;
    expect(Array.isArray(help) ? help.map((item) => item.label) : []).not.toContain(
      'Record a Performance Trace…',
    );
    openReport(t);
    await t.call('report:trace');
    expect(t.deps.recordTrace).toHaveBeenCalledOnce();
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
