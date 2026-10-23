import type { AccountSummary } from '../shared/chrome-api.ts';
import type { AccountMenu, ChromeFeature, WhatsAppContents } from './chrome/feature.ts';
import { watchConnectivity } from './connectivity/connectivity.ts';
import { APP_ID, PRODUCT_NAME } from './identity.ts';
import type { CaptureChoice, DisplayCapturePort, MediaType } from './permissions/session-guard.ts';
import { followThemeSetting, type ThemePort } from './appearance/theme.ts';
import { followZoomSetting, type ZoomableContents } from './appearance/zoom.ts';
import { chromeUserAgent } from './identity/user-agent.ts';
import {
  describeGraphics,
  guardGpu,
  type Graphics,
  type GraphicsReason,
} from './recovery/gpu-safe-mode.ts';
import type { SettingsService } from './settings/service.ts';
import { followHiddenReadsSetting, type ThrottledContents } from './privacy/hidden-reads.ts';
import { watchForReleases, type UpdateNoticeDependencies } from './updates/update-notice.ts';
import {
  startSelfUpdates,
  type SelfUpdateDependencies,
  type Updater,
} from './updates/self-update.ts';
import {
  chooseDisplayBackend,
  describeDisplayBackend,
  type DisplayBackend,
} from './display/backend.ts';
import {
  watchMemory,
  type ProcessMemory,
  type WatchedRenderer,
} from './recovery/memory-watchdog.ts';
import {
  trackCrashes,
  type CrashFiles,
  type CrashReviewDependencies,
} from './crash/crash-reports.ts';
import {
  installSecurity,
  secureSession,
  type GuardedContents,
  type GuardedSession,
  type SecurityDependencies,
} from './security.ts';
import type { ViewInfo, ViewRegistry } from './views.ts';
import type { Overlay } from './recovery/controller.ts';
import type { RendererOptions } from './web-preferences.ts';
import { accountSignals, type AccountSignals } from './accounts/account-signals.ts';
import { partitionOf, type Account, type Accounts } from './accounts/accounts.ts';
import { runAccounts, type AccountPage, type RunningAccounts } from './accounts/running.ts';
import { NOTIFICATION_CHANNELS } from '../shared/notification-api.ts';
import { listenForNotifications, type NotificationIpc } from './notifications/notification-ipc.ts';
import {
  accountNotifier,
  type AccountNotifier,
  type NotifierDependencies,
} from './notifications/notifier.ts';
import type { WindowOptions } from './windows.ts';
import {
  bringToFront,
  claimSingleInstance,
  type Instances,
  type LinkPage,
  type LinkWindow,
} from './instances.ts';
import { chatLinkInArguments } from './navigation/deep-link.ts';
import { refuseUnsafeStart, type UnsafeStartDependencies } from './sandbox-check.ts';
import {
  guardDownloads,
  type DownloadDependencies,
  type DownloadingSession,
} from './downloads/downloads.ts';
import { quitOnShutdown, type ShutdownSources } from './shutdown.ts';
import { showWhenReady, type ReadyPage } from './show-when-ready.ts';
import {
  focusPageWithWindow,
  type FocusablePage,
  type FocusableWindow,
} from './window/focus-page.ts';
import type { BadgeDrawing } from './badge/badge-image.ts';
import { unreadBadge } from './badge/unread-badge.ts';
import { setUpTray, type TrayDependencies, type TrayPort } from './tray.ts';
import { syncAutostartSetting, type AutostartPort } from './autostart/autostart.ts';
import {
  manageMainWindow,
  restoreWindowState,
  type ManagedWindow,
  type WindowStateStore,
} from './window/main-window.ts';
import type { Rect } from './window/window-state.ts';
import { resolveWhatsAppOrigin } from './whatsapp-origin.ts';
import { en } from '../shared/messages/en.ts';

export interface AppPort {
  disableHardwareAcceleration(): void;
  readonly commandLine: { appendSwitch(name: string, value?: string): void };
  userAgentFallback: string;
  enableSandbox(): void;
  whenReady(): Promise<unknown>;
  setAppUserModelId(id: string): void;
  on(
    event: 'window-all-closed' | 'before-quit' | 'will-quit' | 'activate',
    listener: () => void,
  ): unknown;
  on(
    event: 'child-process-gone',
    listener: (event: unknown, details: { readonly type: string; readonly reason: string }) => void,
  ): unknown;
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
  on(event: 'session-created', listener: (session: GuardedSession) => void): unknown;
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: readonly string[]) => void,
  ): unknown;
  on(
    event: 'open-url',
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): unknown;
  requestSingleInstanceLock(): boolean;
  quit(): void;
}

/** An account's WhatsApp, in its own view and partition (ADR 0001). */
type AccountContents = WhatsAppContents &
  ZoomableContents &
  WatchedRenderer &
  ThrottledContents &
  ReadyPage &
  FocusablePage & {
    loadURL(url: string): Promise<unknown>;
    on(event: 'page-title-updated', listener: (event: unknown, title: string) => void): unknown;
    send(channel: string, ...args: unknown[]): void;
  };

/** An account's views in the main window, from `createAccountHost`. */
interface AccountHostPort extends AccountPage {
  readonly webContents: AccountContents;
  readonly createOverlay: (renderer: RendererOptions) => Overlay;
}

/** What deleting a removed account's WhatsApp data needs. */
interface ClearableSession {
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

export interface WindowPort extends LinkWindow, Omit<ManagedWindow, 'on'> {
  on: ManagedWindow['on'] &
    FocusableWindow['on'] &
    ((event: 'show', listener: () => void) => unknown) &
    ((event: 'hide', listener: () => void) => unknown);
  isVisible(): boolean;
  /** Shows the active account's page title, as a browser would. */
  setTitle(title: string): void;
  isFocused(): boolean;
  /** The Windows taskbar overlay, an image from `badge.createImage`. */
  setOverlayIcon(overlay: object | null, description: string): void;
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
}

export interface StartDependencies<Window extends WindowPort> {
  readonly app: AppPort;
  readonly createWindow: (options: WindowOptions) => Window;
  /** An account's views in the window, hidden until it is the active one. */
  readonly createAccountHost: (window: Window, renderer: RendererOptions) => AccountHostPort;
  /** Nothing loads in the default session, but it is guarded all the same. */
  readonly defaultSession: () => GuardedSession;
  /** The session behind a partition, such as an account's (ADR 0001). */
  readonly sessionOf: (partition: string) => GuardedSession & DownloadingSession & ClearableSession;
  readonly accounts: Accounts;
  readonly saveAccounts: (accounts: Accounts) => void;
  readonly newAccountId: () => string;
  /** The preload of WhatsApp's views, which hands its notifications to YapYap (ADR 0011). */
  readonly whatsAppPreload: string;
  readonly notifications: Pick<NotifierDependencies, 'create' | 'isSupported'>;
  readonly ipc: NotificationIpc;
  /** `process.versions.chrome`: the identity must match the bundled engine. */
  readonly chromeVersion: string;
  readonly platform: string;
  readonly askMedia: (view: ViewInfo, mediaTypes: readonly MediaType[]) => Promise<boolean>;
  /**
   * Builds screen capture around YapYap's own picker, which only exists once
   * chrome is ready. `wayland` says whether Chromium runs natively on Wayland.
   */
  readonly capture: (pickInApp: PickInApp, wayland: boolean) => DisplayCapturePort;
  readonly chrome: ChromeFeature;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The command line, for `--safe-mode`. */
  readonly argv: readonly string[];
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly isOnline: () => boolean;
  readonly onResume: (listener: () => void) => void;
  readonly gpuCrashLog: { readonly read: () => string; readonly write: (text: string) => void };
  readonly settings: SettingsService;
  readonly nativeTheme: ThemePort;
  readonly windowState: WindowStateStore;
  /** The usable area of each connected display, once the app is ready. */
  readonly workAreas: () => readonly Rect[];
  readonly shutdown: ShutdownSources;
  /** Whether Chromium's sandbox was turned off on the command line or in the environment. */
  readonly sandboxDisabled: boolean;
  readonly explainUnsafeStart: UnsafeStartDependencies['explain'];
  readonly downloads: Pick<DownloadDependencies, 'folder' | 'taken'>;
  /** `app.getAppMetrics()`: memory per process, for the memory watchdog. */
  readonly appMetrics: () => readonly ProcessMemory[];
  /** Seconds since the last keyboard or mouse input. */
  readonly idleSeconds: () => number;
  /** What tells the user about new releases, for builds that cannot update themselves. */
  readonly releases: Pick<
    UpdateNoticeDependencies,
    'policy' | 'currentVersion' | 'fetchJson' | 'showNotice'
  >;
  /** electron-updater and the restart prompt, for builds that update themselves. */
  readonly selfUpdate: {
    /** Creates electron-updater's updater; called only for builds that update themselves. */
    readonly updater: () => Updater;
    readonly askToInstall: SelfUpdateDependencies['askToInstall'];
  };
  readonly badge: {
    readonly setBadgeCount: (count: number) => boolean;
    readonly createImage: (drawing: BadgeDrawing) => object;
  };
  /** Login items; the setting follows them at startup. */
  readonly autostart: AutostartPort;
  readonly tray: {
    /** Creates the tray icon; the caller keeps it alive. */
    readonly create: () => TrayPort;
    readonly buildMenu: TrayDependencies['buildMenu'];
  };
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly logError: (message: string) => void;
  readonly crashes: {
    readonly files: CrashFiles;
    readonly version: string;
    /** The previous session's log lines, already redacted. */
    readonly previousLog: () => readonly string[];
    readonly review: CrashReviewDependencies['review'];
    readonly writeClipboard: (text: string) => Promise<unknown>;
  };
}

/** Starts without hardware acceleration, for when graphics problems stop YapYap from starting. */
const SAFE_MODE_FLAG = '--safe-mode';

/** A fallback the user did not choose in settings is worth telling them about. */
const GRAPHICS_NOTICES: Readonly<Record<GraphicsReason, string | undefined>> = {
  'safe-mode': en.notices.safeMode,
  'gpu-crashes': en.notices.gpuCrashes,
  settings: undefined,
};

const MAIN_WINDOW: WindowOptions = {
  title: PRODUCT_NAME,
  width: 1200,
  height: 800,
  minWidth: 640,
  minHeight: 480,
  show: false,
};

type PickInApp = (contents: object) => Promise<CaptureChoice | undefined>;

/**
 * Sessions are guarded before the app is ready, but YapYap's picker only
 * exists once chrome is up: until then, requests are denied.
 */
function latePicker(): { readonly pick: PickInApp; readonly bind: (pick: PickInApp) => void } {
  let bound: PickInApp | undefined;
  return {
    pick: (contents) => bound?.(contents) ?? Promise.resolve(undefined),
    bind: (pick) => {
      bound = pick;
    },
  };
}

/** Everything Electron only accepts before the app is ready. */
function beforeReady<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  security: SecurityDependencies,
): Graphics {
  const { app, warn } = deps;
  app.userAgentFallback = security.identity.userAgent;
  // Sandboxes the renderers Electron creates on its own too.
  app.enableSandbox();
  const graphics = guardGpu(app, {
    preferences: deps.settings.current().reliability,
    safeMode: deps.argv.includes(SAFE_MODE_FLAG),
    readLog: deps.gpuCrashLog.read,
    writeLog: deps.gpuCrashLog.write,
    now: Date.now,
    warn,
  });
  installSecurity(app, security);
  deps.chrome.beforeReady();
  // Windows groups notifications and taskbar entries by this ID.
  app.setAppUserModelId(APP_ID);
  app.on('window-all-closed', () => {
    app.quit();
  });
  return graphics;
}

/** Chromium reads the display backend only before the app is ready. */
function applyDisplayBackend<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): DisplayBackend {
  const display = chooseDisplayBackend({
    platform: deps.platform,
    setting: deps.settings.current().reliability.displayBackend,
    argv: deps.argv,
    env: deps.env,
  });
  if (display.ozonePlatform !== undefined) {
    deps.app.commandLine.appendSwitch('ozone-platform', display.ozonePlatform);
  }
  if (display.fallback !== undefined) {
    deps.warn(display.fallback);
  }
  return display;
}

/** Starts watching for unclean exits; the returned function reports the last one once chrome is up. */
function watchCrashes<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): (technicalDetails: () => string) => void {
  const report = trackCrashes({
    files: deps.crashes.files,
    version: deps.crashes.version,
    now: Date.now,
    setting: () => deps.settings.current().privacy.crashReports,
    onQuit: (listener) => {
      deps.app.on('will-quit', listener);
    },
    warn: deps.warn,
  });
  return (technicalDetails) => {
    report({ ...deps.crashes, technicalDetails, openExternal: deps.openExternal }).catch(() => {
      deps.warn('Could not offer the crash report.');
    });
  };
}

/** Tells the user about anything startup changed that they did not choose. */
function announceStartup(
  deps: Pick<
    StartDependencies<WindowPort>,
    'settings' | 'notify' | 'releases' | 'selfUpdate' | 'warn'
  >,
  graphics: Graphics,
): void {
  const betas = (): boolean => deps.settings.current().general.betaUpdates;
  watchForReleases({ ...deps.releases, betas, every: setInterval, warn: deps.warn });
  startSelfUpdates(deps.selfUpdate.updater, {
    betas,
    policy: deps.releases.policy,
    askToInstall: deps.selfUpdate.askToInstall,
    every: setInterval,
    warn: deps.warn,
  });
  if (deps.settings.notice !== undefined) {
    deps.notify(deps.settings.notice);
  }
  const graphicsNotice =
    graphics.reason === undefined ? undefined : GRAPHICS_NOTICES[graphics.reason];
  if (graphicsNotice !== undefined) {
    deps.notify(graphicsNotice);
  }
}

function whatsAppOrigin(
  env: Readonly<Record<string, string | undefined>>,
  warn: (message: string) => void,
): string {
  const { origin, rejectedOverride } = resolveWhatsAppOrigin(env['YAPYAP_TEST_WHATSAPP_ORIGIN']);
  if (rejectedOverride) {
    warn('Ignoring YAPYAP_TEST_WHATSAPP_ORIGIN: only loopback http origins are allowed.');
  }
  return origin;
}

/**
 * Each account's session gets YapYap's guards and download handling (the
 * `session-created` hook also secures it, before anything loads there).
 */
function guardAccountSession<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  security: Parameters<typeof secureSession>[1],
  account: Account,
): void {
  const session = deps.sessionOf(partitionOf(account));
  secureSession(session, security);
  guardDownloads(session, { ...deps.downloads, notify: deps.notify, warn: deps.warn });
}

/** Opens the main window where the user left it. */
function openMainWindow<Window extends WindowPort>(deps: StartDependencies<Window>): Window {
  const { state, bounds } = restoreWindowState(deps.windowState, deps.workAreas());
  const window = deps.createWindow({ ...MAIN_WINDOW, ...bounds });
  manageMainWindow(window, state, {
    store: deps.windowState,
    platform: deps.platform,
    settings: deps.settings,
    app: deps.app,
    warn: deps.warn,
  });
  return window;
}

/** Never runs unsandboxed: explains why YapYap will not start, then quits. */
function refuseWithoutSandbox<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): Promise<void> {
  return refuseUnsafeStart({
    whenReady: () => deps.app.whenReady(),
    explain: deps.explainUnsafeStart,
    openExternal: deps.openExternal,
    logError: deps.logError,
    quit: () => {
      deps.app.quit();
    },
  });
}

/** An open account's views, and how to bring its WhatsApp back after an outage. */
interface OpenedAccount extends AccountPage {
  readonly contents: AccountContents;
  readonly reconnect: () => void;
  /** Settles once its first load ends, however it ends. */
  readonly loaded: Promise<void>;
}

interface AccountWiring<Window extends WindowPort> {
  readonly deps: StartDependencies<Window>;
  readonly chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>;
  readonly security: Parameters<typeof secureSession>[1];
  readonly window: Window;
  readonly signals: AccountSignals;
  readonly origin: string;
  /** The accounts once they run; read on use, after they all opened. */
  readonly running: () => RunningAccounts<OpenedAccount>;
  /** Where an account first loads: a chat link from the command line, once, or WhatsApp. */
  readonly firstUrl: (account: Account) => string;
  readonly notifiers: Notifiers;
}

/** Each account's notifier, found by its page, and all of them for quitting. */
interface Notifiers {
  readonly byPage: WeakMap<object, AccountNotifier>;
  readonly all: Set<AccountNotifier>;
}

/**
 * Shows an account's WhatsApp notifications; a click brings its window
 * forward, switches to it and lets WhatsApp open the chat.
 */
function notifyFor<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
  contents: AccountContents,
): AccountNotifier {
  const { deps, window, running } = wiring;
  const notifier = accountNotifier(
    {
      ...deps.notifications,
      privacy: () => {
        const { notificationSender, notificationText } = deps.settings.current().privacy;
        return { sender: notificationSender, text: notificationText };
      },
      now: Date.now,
      warn: deps.warn,
    },
    {
      heading: () => {
        const names = new Map(
          running()
            .list()
            .map(({ id, name }) => [id, name]),
        );
        return running().opened().length > 1 ? names.get(account.id) : undefined;
      },
      onClick: (id) => {
        bringToFront(window);
        running().switchTo(account.id);
        contents.send(NOTIFICATION_CHANNELS.click, id);
      },
    },
  );
  wiring.notifiers.byPage.set(contents, notifier);
  wiring.notifiers.all.add(notifier);
  return notifier;
}

/** Opens an account's views, hidden, and everything that watches or serves its WhatsApp. */
function openAccount<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
): OpenedAccount {
  const { deps, chrome, window, signals, origin } = wiring;
  guardAccountSession(deps, wiring.security, account);
  const host = deps.createAccountHost(window, {
    partition: partitionOf(account),
    preload: deps.whatsAppPreload,
  });
  const contents = host.webContents;
  const notifier = notifyFor(wiring, account, contents);
  wiring.security.views.set(contents, { zone: 'whatsapp', home: origin, label: account.name });
  const recovery = chrome.attachRecovery(contents, origin, host.createOverlay);
  watchMemory(contents, {
    metrics: deps.appMetrics,
    limitMb: () => deps.settings.current().reliability.memoryWatchdogMb,
    focused: () => window.isFocused(),
    idleSeconds: deps.idleSeconds,
    every: setInterval,
    warn: deps.warn,
  });
  followZoomSetting(contents, deps.settings);
  followHiddenReadsSetting(contents, deps.settings);
  contents.on('page-title-updated', (_event, title) => {
    signals.pageTitle(account.id, title);
  });
  // A failed load is reported by the recovery monitor.
  const loaded = contents
    .loadURL(wiring.firstUrl(account))
    .then(reportedElsewhere, reportedElsewhere);
  const close = (): void => {
    notifier.closeAll();
    wiring.notifiers.all.delete(notifier);
    host.close();
  };
  return { ...host, close, contents, reconnect: recovery.reconnect, loaded };
}

/** Deletes a removed account's WhatsApp data; its folder goes at the next start. */
async function forgetAccount<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  signals: AccountSignals,
  account: Account,
): Promise<void> {
  signals.forget(account.id);
  const session = deps.sessionOf(partitionOf(account));
  await session.clearStorageData();
  await session.clearCache();
}

/** A failed page load needs no handling here: the recovery monitor reports it. */
const reportedElsewhere = (): undefined => undefined;

/** Every account, marking the one on screen. */
function summaries(running: RunningAccounts<OpenedAccount>): AccountSummary[] {
  const active = running.active().account.id;
  return running.list().map((account) => ({ ...account, active: account.id === active }));
}

/** What the Account menu shows and does. */
function accountMenu(
  running: RunningAccounts<OpenedAccount>,
  warn: (message: string) => void,
): AccountMenu {
  return {
    entries: summaries(running),
    activeContents: () => running.active().page.contents,
    switchTo: running.switchTo,
    add: running.add,
    update: running.update,
    remove: (id) =>
      running.remove(id).catch(() => {
        warn('Could not delete the data of a removed account.');
        return true;
      }),
  };
}

/** The window's title and the app badge, from every account's page title. */
function windowSignals<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'badge' | 'platform'>,
  window: Window,
  tray: (unread: number) => void,
): AccountSignals {
  const badge = unreadBadge({
    ...deps.badge,
    platform: deps.platform,
    setOverlayIcon: window.setOverlayIcon.bind(window),
  });
  return accountSignals({
    setTitle: (title) => {
      window.setTitle(title);
    },
    showUnread: (total) => {
      badge(total);
      tray(total);
    },
    initialTitle: PRODUCT_NAME,
  });
}

/**
 * The tray: the running accounts, the unread count of all of them, and
 * whether the window is out of sight. Returns how to refresh it and how to
 * give it a new unread count.
 */
function accountsTray<Window extends WindowPort>(
  { deps, chrome, window }: Omit<AccountWiring<Window>, 'signals' | 'running'>,
  running: () => RunningAccounts<OpenedAccount>,
): { readonly refresh: () => void; readonly setUnread: (unread: number) => void } {
  let unread = 0;
  const update = setUpTray(deps.tray.create(), window, {
    platform: deps.platform,
    buildMenu: deps.tray.buildMenu,
    switchAccount: (id) => {
      running().switchTo(id);
    },
    openSettings: chrome.openSettings,
    quit: () => {
      deps.app.quit();
    },
  });
  const refresh = (): void => {
    update({ unread, accounts: summaries(running()), windowShown: window.isVisible() });
  };
  window.on('show', refresh);
  window.on('hide', refresh);
  return {
    refresh,
    setUnread: (total) => {
      unread = total;
      refresh();
    },
  };
}

/** Every enabled account, in its own view of the main window; the active one shows. */
function openAccounts<Window extends WindowPort>(
  wiring: Omit<AccountWiring<Window>, 'signals' | 'running'>,
): RunningAccounts<OpenedAccount> {
  const { deps, chrome, window } = wiring;
  const tray = accountsTray(wiring, () => running);
  const signals = windowSignals(deps, window, tray.setUnread);
  const changed = (): void => {
    signals.activate(running.active().account.id);
    chrome.setAccountMenu(accountMenu(running, deps.warn));
    tray.refresh();
  };
  const running: RunningAccounts<OpenedAccount> = runAccounts({
    accounts: deps.accounts,
    open: (account) => openAccount({ ...wiring, signals, running: () => running }, account),
    save: deps.saveAccounts,
    forget: (account) => forgetAccount(deps, signals, account),
    newId: deps.newAccountId,
    onChange: changed,
  });
  changed();
  watchConnectivity({
    isOnline: deps.isOnline,
    onResume: deps.onResume,
    every: setInterval,
    schedule: setTimeout,
    onChange: signals.setOnline,
    reconnect: () => {
      for (const { page } of running.opened()) {
        page.reconnect();
      }
    },
  });
  return running;
}

/** The window-wide parts: chat links, focus, and showing the window. */
function wireMainWindow<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
  window: Window,
  running: RunningAccounts<OpenedAccount>,
  origin: string,
): LinkPage {
  const activePage = (): AccountContents => running.active().page.contents;
  const page: LinkPage = { loadURL: (url) => activePage().loadURL(url) };
  chrome.openChatsWith((phone) => {
    const target = new URL('/send', origin);
    target.searchParams.set('phone', phone);
    bringToFront(window);
    // A failed load is reported by the recovery monitor.
    page.loadURL(target.href).catch(() => undefined);
  });
  focusPageWithWindow(window, {
    focus: () => {
      activePage().focus();
    },
  });
  showWhenReady(window, deps.settings.current().general.startMinimized, activePage());
  return page;
}

/**
 * Opens a chat link from the command line in the account YapYap starts on,
 * and only the first time that account loads.
 */
function chatLinkOnce(
  link: string | undefined,
  startsOn: string,
  origin: string,
): (account: Account) => string {
  let pending = link;
  return (account) => {
    if (account.id !== startsOn || pending === undefined) {
      return origin;
    }
    const target = pending;
    pending = undefined;
    return target;
  };
}

/** Hears every account's notifications, and withdraws them all when YapYap quits. */
function listenToNotifications<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  origin: string,
): Notifiers {
  const notifiers: Notifiers = { byPage: new WeakMap(), all: new Set() };
  listenForNotifications(deps.ipc, (sender) => notifiers.byPage.get(sender), origin, deps.warn);
  deps.app.on('will-quit', () => {
    for (const notifier of notifiers.all) {
      notifier.closeAll();
    }
  });
  return notifiers;
}

/** Opens the main window with every account, and waits for their first loads. */
async function openWindow<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
  security: Parameters<typeof secureSession>[1],
  instances: Instances,
  origin: string,
): Promise<void> {
  const window = openMainWindow(deps);
  const running = openAccounts({
    deps,
    chrome,
    security,
    window,
    origin,
    firstUrl: chatLinkOnce(chatLinkInArguments(deps.argv, origin), deps.accounts.active, origin),
    notifiers: listenToNotifications(deps, origin),
  });
  instances.attach(window, wireMainWindow(deps, chrome, window, running, origin));
  // A failed load must not end startup: the monitor shows the recovery screen.
  await Promise.all(running.opened().map(({ page }) => page.loaded));
}

/** How YapYap presents itself to WhatsApp: the bundled Chromium, as desktop Chrome. */
function browserIdentity<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): SecurityDependencies['identity'] {
  return {
    userAgent: chromeUserAgent(deps.platform, deps.chromeVersion),
    chromeVersion: deps.chromeVersion,
  };
}

export async function startApp<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): Promise<void> {
  const { app, warn } = deps;
  if (deps.sandboxDisabled) {
    await refuseWithoutSandbox(deps);
    return;
  }
  const origin = whatsAppOrigin(deps.env, warn);
  const instances = claimSingleInstance(app, origin, warn);
  if (instances === undefined) {
    return;
  }
  quitOnShutdown(deps.shutdown, () => {
    app.quit();
  });
  const reportCrash = watchCrashes(deps);
  const views: ViewRegistry = new WeakMap();
  const identity = browserIdentity(deps);
  const picker = latePicker();
  const display = applyDisplayBackend(deps);
  const capture = deps.capture(picker.pick, display.active === 'wayland');
  const security = { ...deps, capture, views, identity };
  const graphics = beforeReady(deps, security);

  await app.whenReady();
  secureSession(deps.defaultSession(), security);
  followThemeSetting(deps.nativeTheme, deps.settings);
  syncAutostartSetting(deps.autostart, deps.settings, warn);
  const rendering = `${describeGraphics(graphics)}, display ${describeDisplayBackend(display)}`;
  const chrome = deps.chrome.afterReady(views, warn, rendering);
  picker.bind(chrome.pickCaptureSource);
  announceStartup(deps, graphics);
  reportCrash(chrome.technicalDetails);
  await openWindow(deps, chrome, security, instances, origin);
}
