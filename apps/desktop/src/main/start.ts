import type { AccountSummary } from '../shared/chrome-api.ts';
import type { AccountMenu, ChromeFeature, WhatsAppContents } from './chrome/feature.ts';
import type { SidebarPort } from './chrome/sidebar.ts';
import { watchConnectivity } from './connectivity/connectivity.ts';
import { APP_ID, PRODUCT_NAME } from './identity.ts';
import type {
  CaptureChoice,
  DisplayCapturePort,
  MediaType,
  PermissionMemory,
} from './permissions/session-guard.ts';
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
import { trackVisibility, type Visibility } from './window/visibility.ts';
import { applyResourceLimits } from './reliability/resource-limits.ts';
import {
  type ProxySwitches,
  type ProxiedSession,
  type ProxyController,
  type WebRtcPage,
} from './network/proxy.ts';
import { trackShares, type ScreenShares, type ShareIpc } from './capture/shares.ts';
import {
  createPrivacyScreen,
  type CoverablePage,
  type PrivacyScreen,
} from './privacy/privacy-screen.ts';
import { isSilenced, quietAudio, setDoNotDisturb, type AudioPage } from './notifications/quiet.ts';
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
import {
  contextMenuFor,
  followProxy,
  guardAccountSession,
  type DictionarySession,
} from './account-session.ts';
import { runAccounts, type AccountPage, type RunningAccounts } from './accounts/running.ts';
import { NOTIFICATION_CHANNELS } from '../shared/notification-api.ts';
import { listenForNotifications, type NotificationIpc } from './notifications/notification-ipc.ts';
import {
  accountNotifier,
  type AccountNotifier,
  type NotifierAccount,
  type NotifierDependencies,
} from './notifications/notifier.ts';
import { draftReply, supportsInlineReply, type ReplyContents } from './notifications/reply.ts';
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
import { type DownloadDependencies, type DownloadingSession } from './downloads/downloads.ts';
import { quitOnShutdown, type ShutdownSources } from './shutdown.ts';
import { showWhenReady, type ReadyPage } from './show-when-ready.ts';
import {
  focusPageWithWindow,
  type FocusablePage,
  type FocusableWindow,
} from './window/focus-page.ts';
import type { BadgeDrawing } from './badge/badge-image.ts';
import { unreadBadge } from './badge/unread-badge.ts';
import { setUpTray, type TrayDependencies, type TrayPort } from './tray/tray.ts';
import {
  followTrayIconSetting,
  type SchemeSource,
  type TrayIconDependencies,
} from './tray/tray-icon.ts';
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
import {
  followGlobalShortcuts,
  toggleWindow,
  type GlobalShortcutPort,
} from './shortcuts/global-shortcuts.ts';
import type { ContextMenuItem, MenuPage } from './spelling/context-menu.ts';
import { followSpellingSetting, type SpellingController } from './spelling/spelling.ts';
import { createProxyLogin, type AuthInfo, type LoginCallback } from './network/proxy-login.ts';
import type { SecretStore } from './secrets/secret-store.ts';
import { useCameraPortal } from './permissions/camera-portal.ts';
import { sidebarSource } from './accounts/sidebar-source.ts';
import type { CodePage, CustomCodeController } from './custom-code/custom-code.ts';

export interface AppPort {
  disableHardwareAcceleration(): void;
  readonly commandLine: ProxySwitches & { appendSwitch(name: string, value?: string): void };
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
  on(
    event: 'login',
    listener: (
      event: { preventDefault(): void },
      contents: { readonly session: object } | null | undefined,
      details: unknown,
      info: AuthInfo,
      callback: LoginCallback,
    ) => void,
  ): unknown;
  on(
    event: 'session-created',
    listener: (session: GuardedSession & ProxiedSession) => void,
  ): unknown;
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
export type AccountContents = WhatsAppContents &
  ZoomableContents &
  WatchedRenderer &
  ThrottledContents &
  AudioPage &
  WebRtcPage &
  ReplyContents &
  CoverablePage &
  ReadyPage &
  FocusablePage &
  MenuPage &
  CodePage & {
    replaceMisspelling(word: string): void;
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
    ((event: 'hide', listener: () => void) => unknown) &
    ((event: 'minimize', listener: () => void) => unknown) &
    ((event: 'restore', listener: () => void) => unknown) &
    ((event: 'blur', listener: () => void) => unknown);
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
  /** The account sidebar, docked in the main window. */
  readonly createSidebar: (window: Window, renderer: RendererOptions) => SidebarPort;
  /** An account's views in the window, hidden until it is the active one. */
  readonly createAccountHost: (window: Window, renderer: RendererOptions) => AccountHostPort;
  /** Nothing loads in the default session, but it is guarded all the same. */
  readonly defaultSession: () => GuardedSession & ProxiedSession;
  /** The session behind a partition, such as an account's (ADR 0001). */
  readonly sessionOf: (
    partition: string,
  ) => GuardedSession & DownloadingSession & ClearableSession & DictionarySession & ProxiedSession;
  readonly accounts: Accounts;
  readonly saveAccounts: (accounts: Accounts) => void;
  readonly newAccountId: () => string;
  /** The preload of WhatsApp's views, which hands its notifications to YapYap (ADR 0011). */
  readonly whatsAppPreload: string;
  /** The user's own CSS and JavaScript, applied to every account's WhatsApp (#72). */
  readonly customCode: Pick<CustomCodeController, 'attach'>;
  readonly notifications: Pick<NotifierDependencies, 'create' | 'isSupported'>;
  readonly ipc: NotificationIpc & ShareIpc;
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
  readonly downloads: Pick<
    DownloadDependencies,
    'folder' | 'taken' | 'lastFolder' | 'openPath' | 'track'
  >;
  /** `app.getAppMetrics()`: memory per process, for the memory watchdog. */
  readonly appMetrics: () => readonly ProcessMemory[];
  /** Seconds since the last keyboard or mouse input. */
  readonly idleSeconds: () => number;
  /** Electron's `globalShortcut`, for the shortcuts that work from any app. */
  readonly globalShortcuts: GlobalShortcutPort;
  /** `app.getPreferredSystemLanguages()`, which picks the spelling language until the user does. */
  readonly systemLanguages: () => readonly string[];
  /** Shows a context menu where the pointer is. */
  readonly contextMenu: (items: ContextMenuItem[]) => void;
  /** Passwords and other secrets, encrypted by the system's keychain. */
  readonly secrets: SecretStore;
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
    readonly image: TrayIconDependencies['image'];
    readonly scheme: SchemeSource;
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
  applyResourceLimits(app.commandLine, deps.settings.current().reliability);
  useCameraPortal(app.commandLine, deps.env);
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

/** Requests that come from no page, such as a service worker's, share one record of attempts. */
const NO_PAGE = {};

/** Proxies that ask for a password get the saved one, or the user is asked (#76). */
function signInToProxies<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'app' | 'secrets'>,
  chrome: Pick<ReturnType<StartDependencies<Window>['chrome']['afterReady']>, 'askProxyLogin'>,
): void {
  const login = createProxyLogin({
    secrets: deps.secrets,
    ask: chrome.askProxyLogin,
    now: Date.now,
  });
  deps.app.on('login', (event, contents, _details, info, callback) => {
    login.handle(event, contents?.session ?? NO_PAGE, info, callback);
  });
}

/** The shortcuts that work from any app, given back when YapYap quits (#75). */
function takeGlobalShortcuts<Window extends WindowPort>(
  deps: Pick<StartDependencies<Window>, 'app' | 'globalShortcuts' | 'settings'>,
  window: Window,
): void {
  followGlobalShortcuts(deps.globalShortcuts, deps.settings, {
    toggleWindow: () => {
      toggleWindow(window);
    },
  });
  deps.app.on('will-quit', () => {
    deps.globalShortcuts.unregisterAll();
  });
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
  /** Camera and microphone answers for this account, kept until YapYap quits (#77). */
  readonly permissions: PermissionMemory;
  /** Settles once its first load ends, however it ends. */
  readonly loaded: Promise<void>;
}

export interface AccountWiring<Window extends WindowPort> {
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
  readonly spelling: SpellingController;
  readonly proxy: ProxyController;
}

/** Each account's notifier, found by its page, and all of them for quitting. */
interface Notifiers {
  readonly byPage: WeakMap<object, AccountNotifier>;
  readonly all: Set<AccountNotifier>;
}

/** The account's name, to head its notifications when several accounts run. */
function headingOf(running: RunningAccounts<OpenedAccount>, id: string): string | undefined {
  const names = new Map(running.list().map((entry) => [entry.id, entry.name]));
  return running.opened().length > 1 ? names.get(id) : undefined;
}

/**
 * What an account's notifications do: a click brings its window forward,
 * switches to it and lets WhatsApp open the chat; a reply does the same,
 * then waits in the chat's message box for the user to send it (#60).
 */
function notifierAccount<Window extends WindowPort>(
  { deps, window, running }: AccountWiring<Window>,
  account: Account,
  contents: AccountContents,
): NotifierAccount {
  const open = (id: string): void => {
    bringToFront(window);
    running().switchTo(account.id);
    contents.send(NOTIFICATION_CHANNELS.click, id);
  };
  return {
    heading: () => headingOf(running(), account.id),
    silenced: () => {
      const { doNotDisturb } = deps.settings.current().general;
      return running()
        .list()
        .some((entry) => entry.id === account.id && isSilenced(doNotDisturb, entry));
    },
    onClick: open,
    onReply: (id, text) => {
      open(id);
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });
      void draftReply(contents, text, { wait, warn: deps.warn });
    },
  };
}

/**
 * Shows an account's WhatsApp notifications, and finds them by the page
 * that showed them.
 */
function notifyFor<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
  contents: AccountContents,
): AccountNotifier {
  const { deps } = wiring;
  const notifier = accountNotifier(
    {
      ...deps.notifications,
      privacy: () => {
        const { notificationSender, notificationText } = deps.settings.current().privacy;
        return { sender: notificationSender, text: notificationText };
      },
      inlineReply: supportsInlineReply(deps.platform),
      now: Date.now,
      warn: deps.warn,
    },
    notifierAccount(wiring, account, contents),
  );
  wiring.notifiers.byPage.set(contents, notifier);
  wiring.notifiers.all.add(notifier);
  return notifier;
}

/** Its memory, its zoom and hidden reads, and its title, which carries the unread count. */
function watchAccountPage<Window extends WindowPort>(
  { deps, window, signals }: AccountWiring<Window>,
  contents: AccountContents,
  account: Account,
): void {
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
  deps.customCode.attach(contents, account.id);
  contents.on('page-title-updated', (_event, title) => {
    signals.pageTitle(account.id, title);
  });
}

/** Opens an account's views, hidden, and everything that watches or serves its WhatsApp. */
function openAccount<Window extends WindowPort>(
  wiring: AccountWiring<Window>,
  account: Account,
): OpenedAccount {
  const { deps, chrome, window, origin } = wiring;
  const { session, proxied, permissions } = guardAccountSession(deps, wiring, account);
  const host = deps.createAccountHost(window, {
    partition: partitionOf(account),
    preload: deps.whatsAppPreload,
    // The session's setting decides whether anything is checked (#73).
    spellcheck: true,
  });
  const contents = host.webContents;
  contextMenuFor(wiring, contents, session);
  const notifier = notifyFor(wiring, account, contents);
  const view = {
    zone: 'whatsapp',
    home: origin,
    label: account.name,
    account: account.id,
  } as const;
  wiring.security.views.set(contents, view);
  const recovery = chrome.attachRecovery(contents, origin, host.createOverlay);
  watchAccountPage(wiring, contents, account);
  wiring.proxy.guardCalls(contents, account.id);
  // Nothing loads before the proxy is set; a failed load is reported by the recovery monitor.
  const loaded = proxied
    .then(() => contents.loadURL(wiring.firstUrl(account)))
    .then(reportedElsewhere, reportedElsewhere);
  const close = (): void => {
    notifier.closeAll();
    wiring.notifiers.all.delete(notifier);
    host.close();
  };
  return { ...host, close, contents, reconnect: recovery.reconnect, loaded, permissions };
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
  return running.list().map((account) => ({
    ...account,
    muted: account.muted === true,
    proxy: account.proxy ?? '',
    active: account.id === active,
  }));
}

function pageOf(running: RunningAccounts<OpenedAccount>, id: string): OpenedAccount | undefined {
  return running.opened().find(({ account }) => account.id === id)?.page;
}

/** What the Account menu shows and does. */
function accountMenu(
  running: RunningAccounts<OpenedAccount>,
  warn: (message: string) => void,
  privacy: PrivacyScreen,
): AccountMenu {
  return {
    privacyScreen: privacy.covered(),
    togglePrivacyScreen: privacy.toggle,
    entries: summaries(running),
    activeContents: () => running.active().page.contents,
    switchTo: running.switchTo,
    add: running.add,
    update: running.update,
    permissions: (id) => pageOf(running, id)?.permissions.allowed(),
    forgetPermissions: (id) => {
      pageOf(running, id)?.permissions.forget();
    },
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
/** What the tray menu does. */
/** What the tray and the menu show besides the accounts: shares and the privacy screen. */
interface Screens {
  readonly shares: ScreenShares;
  readonly privacy: PrivacyScreen;
}

function trayActions<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: AccountWiring<Window>['chrome'],
  running: () => RunningAccounts<OpenedAccount>,
  { shares, privacy }: Screens,
): TrayDependencies {
  return {
    platform: deps.platform,
    buildMenu: deps.tray.buildMenu,
    switchAccount: (id) => {
      running().switchTo(id);
    },
    openSettings: chrome.openSettings,
    setDoNotDisturb: (on) => {
      setDoNotDisturb(deps.settings, on);
    },
    stopSharing: shares.stop,
    togglePrivacyScreen: privacy.toggle,
    quit: () => {
      deps.app.quit();
    },
  };
}

function accountsTray<Window extends WindowPort>(
  { deps, chrome, window }: Omit<AccountWiring<Window>, 'signals' | 'running'>,
  running: () => RunningAccounts<OpenedAccount>,
  visibility: Visibility,
  screens: Screens,
): { readonly refresh: () => void; readonly setUnread: (unread: number) => void } {
  let unread = 0;
  const port = deps.tray.create();
  followTrayIconSetting(port, { ...deps.tray, platform: deps.platform, settings: deps.settings });
  const update = setUpTray(port, window, trayActions(deps, chrome, running, screens));
  const refresh = (): void => {
    update({
      unread,
      accounts: summaries(running()),
      windowShown: visibility.visible(),
      doNotDisturb: deps.settings.current().general.doNotDisturb,
      sharing: [...screens.shares.sharing()],
      privacyScreen: screens.privacy.covered(),
    });
  };
  return {
    refresh,
    setUnread: (total) => {
      unread = total;
      refresh();
    },
  };
}

/** Mutes the sound of silenced accounts out of sight; run again on every change. */
function keepQuiet<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  running: RunningAccounts<OpenedAccount>,
  visibility: Visibility,
): void {
  quietAudio(
    running.opened().map(({ account, page }) => ({ account, page: page.contents })),
    deps.settings.current().general.doNotDisturb,
    visibility.onScreen() ? running.active().account.id : undefined,
  );
}

interface AccountIndicators {
  readonly visibility: Visibility;
  /** Shows the accounts, their shares and do not disturb anew. */
  readonly refresh: () => void;
  readonly setUnread: (total: number) => void;
  readonly privacy: PrivacyScreen;
}

/**
 * What shows the accounts outside their pages: the tray and the sidebar,
 * with their unread counts and running screen shares (#161).
 */
function accountIndicators<Window extends WindowPort>(
  wiring: Omit<AccountWiring<Window>, 'signals' | 'running'>,
  running: () => RunningAccounts<OpenedAccount>,
  signals: () => AccountSignals,
  menuChanged: () => void,
): AccountIndicators {
  const { deps, chrome, window } = wiring;
  const privacy = privacyScreenOf(deps, window, running, () => {
    refresh();
    menuChanged();
  });
  const shares = trackShares(deps.ipc, {
    accountOf: (sender) => wiring.security.views.get(sender)?.account,
    origin: wiring.origin,
    onChange: () => {
      refresh();
    },
    warn: deps.warn,
  });
  const visibility = trackVisibility(window, () => {
    tray.refresh();
    keepQuiet(deps, running(), visibility);
  });
  const tray = accountsTray(wiring, running, visibility, { shares, privacy });
  const sidebar = chrome.attachSidebar((renderer) => deps.createSidebar(window, renderer));
  const refresh = (): void => {
    tray.refresh();
    sidebar(sidebarSource(deps.settings.current(), running(), signals(), shares));
  };
  const setUnread = (total: number): void => {
    tray.setUnread(total);
    refresh();
  };
  return { visibility, refresh, setUnread, privacy };
}

/** The privacy screen over every account's WhatsApp, which looks again on focus changes. */
function privacyScreenOf<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  window: Window,
  running: () => RunningAccounts<OpenedAccount>,
  onChange: () => void,
): PrivacyScreen {
  const privacy = createPrivacyScreen({
    settings: deps.settings,
    pages: () =>
      running()
        .opened()
        .map(({ page }) => page.contents),
    focused: () => window.isFocused(),
    idleSeconds: deps.idleSeconds,
    every: setInterval,
    onChange,
  });
  window.on('focus', privacy.update);
  window.on('blur', privacy.update);
  return privacy;
}

/** Every enabled account, in its own view of the main window; the active one shows. */
function openAccounts<Window extends WindowPort>(
  wiring: Omit<AccountWiring<Window>, 'signals' | 'running'>,
): RunningAccounts<OpenedAccount> {
  const { deps, chrome, window } = wiring;
  const menuChanged = (): void => {
    chrome.setAccountMenu(accountMenu(running, deps.warn, indicators.privacy));
  };
  const indicators = accountIndicators(
    wiring,
    () => running,
    () => signals,
    menuChanged,
  );
  const signals: AccountSignals = windowSignals(deps, window, indicators.setUnread);
  const changed = (): void => {
    signals.activate(running.active().account.id);
    menuChanged();
    indicators.refresh();
    keepQuiet(deps, running, indicators.visibility);
  };
  wiring.proxy.useAccounts(deps.accounts.accounts);
  const running: RunningAccounts<OpenedAccount> = runAccounts({
    accounts: deps.accounts,
    open: (account) => openAccount({ ...wiring, signals, running: () => running }, account),
    save: (accounts) => {
      deps.saveAccounts(accounts);
      wiring.proxy.useAccounts(accounts.accounts);
    },
    forget: (account) => forgetAccount(deps, signals, account),
    newId: deps.newAccountId,
    onChange: changed,
  });
  changed();
  // The menu and the tray show do not disturb, and it decides what is muted.
  deps.settings.onChange(changed);
  reconnectWhenOnline(deps, signals, running);
  return running;
}

/** Marks the title while offline, and reloads every account when the network returns. */
function reconnectWhenOnline<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  signals: AccountSignals,
  running: RunningAccounts<OpenedAccount>,
): void {
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
  proxy: ProxyController,
): Promise<void> {
  const window = openMainWindow(deps);
  takeGlobalShortcuts(deps, window);
  const running = openAccounts({
    deps,
    chrome,
    security,
    window,
    origin,
    proxy,
    firstUrl: chatLinkOnce(chatLinkInArguments(deps.argv, origin), deps.accounts.active, origin),
    notifiers: listenToNotifications(deps, origin),
    spelling: followSpellingSetting(deps.settings, deps.systemLanguages),
  });
  instances.attach(window, wireMainWindow(deps, chrome, window, running, origin));
  // A failed load must not end startup: the monitor shows the recovery screen.
  await Promise.all(running.opened().map(({ page }) => page.loaded));
}

/**
 * The first launch opens the welcome over WhatsApp, and saves the default
 * settings, so the welcome never opens again (#84).
 */
function welcomeOnFirstRun<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  chrome: ReturnType<StartDependencies<Window>['chrome']['afterReady']>,
): void {
  if (!deps.settings.firstRun) {
    return;
  }
  deps.settings.update((settings) => settings);
  chrome.openWelcome();
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
  const proxy = await followProxy(deps);
  followThemeSetting(deps.nativeTheme, deps.settings);
  syncAutostartSetting(deps.autostart, deps.settings, warn);
  const rendering = `${describeGraphics(graphics)}, display ${describeDisplayBackend(display)}`;
  const chrome = deps.chrome.afterReady(views, warn, rendering);
  signInToProxies(deps, chrome);
  picker.bind(chrome.pickCaptureSource);
  announceStartup(deps, graphics);
  reportCrash(chrome.technicalDetails);
  await openWindow(deps, chrome, security, instances, origin, proxy);
  welcomeOnFirstRun(deps, chrome);
}
