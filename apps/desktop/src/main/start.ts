import type { ChromeFeature, WhatsAppContents } from './chrome/feature.ts';
import { watchConnectivity } from './connectivity/connectivity.ts';
import { offlineTitle, type TitledWindow } from './connectivity/offline-title.ts';
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
import type { WindowOptions } from './windows.ts';
import { claimSingleInstance, type LinkWindow } from './instances.ts';
import { chatLinkInArguments } from './navigation/deep-link.ts';
import { refuseUnsafeStart, type UnsafeStartDependencies } from './sandbox-check.ts';
import {
  guardDownloads,
  type DownloadDependencies,
  type DownloadingSession,
} from './downloads/downloads.ts';
import { quitOnShutdown, type ShutdownSources } from './shutdown.ts';
import { showWhenReady } from './show-when-ready.ts';
import {
  manageMainWindow,
  restoreWindowState,
  type ManagedWindow,
  type WindowStateStore,
} from './window/main-window.ts';
import type { Rect } from './window/window-state.ts';
import { resolveWhatsAppOrigin } from './whatsapp-origin.ts';

export interface AppPort {
  disableHardwareAcceleration(): void;
  readonly commandLine: { appendSwitch(name: string): void };
  userAgentFallback: string;
  enableSandbox(): void;
  whenReady(): Promise<unknown>;
  setAppUserModelId(id: string): void;
  on(event: 'window-all-closed' | 'before-quit' | 'activate', listener: () => void): unknown;
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

export interface WindowPort
  extends Omit<TitledWindow, 'on'>, LinkWindow, Omit<ManagedWindow, 'on'> {
  on: TitledWindow['on'] & ManagedWindow['on'];
  readonly webContents: WhatsAppContents & ZoomableContents;
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface StartDependencies<Window extends WindowPort> {
  readonly app: AppPort;
  readonly createWindow: (options: WindowOptions) => Window;
  readonly createOverlay: (window: Window, renderer: RendererOptions) => Overlay;
  readonly defaultSession: () => GuardedSession & DownloadingSession;
  /** `process.versions.chrome`: the identity must match the bundled engine. */
  readonly chromeVersion: string;
  readonly platform: string;
  readonly askMedia: (view: ViewInfo, mediaTypes: readonly MediaType[]) => Promise<boolean>;
  /** Builds screen capture around YapYap's own picker, which only exists once chrome is ready. */
  readonly capture: (pickInApp: PickInApp) => DisplayCapturePort;
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
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly logError: (message: string) => void;
}

/** Starts without hardware acceleration, for when graphics problems stop YapYap from starting. */
const SAFE_MODE_FLAG = '--safe-mode';

/** A fallback the user did not choose in settings is worth telling them about. */
const GRAPHICS_NOTICES: Readonly<Record<GraphicsReason, string | undefined>> = {
  'safe-mode': 'YapYap started in safe mode, without hardware acceleration.',
  'gpu-crashes':
    'Graphics kept crashing, so YapYap started without hardware acceleration this time.',
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

/** Tells the user about anything startup changed that they did not choose. */
function announceStartup(
  deps: Pick<StartDependencies<WindowPort>, 'settings' | 'notify'>,
  graphics: Graphics,
): void {
  if (deps.settings.notice !== undefined) deps.notify(deps.settings.notice);
  const graphicsNotice =
    graphics.reason === undefined ? undefined : GRAPHICS_NOTICES[graphics.reason];
  if (graphicsNotice !== undefined) deps.notify(graphicsNotice);
}

function whatsAppOrigin(
  env: Readonly<Record<string, string | undefined>>,
  warn: (message: string) => void,
): string {
  const { origin, rejectedOverride } = resolveWhatsAppOrigin(env['YAPYAP_TEST_WHATSAPP_ORIGIN']);
  if (rejectedOverride)
    warn('Ignoring YAPYAP_TEST_WHATSAPP_ORIGIN: only loopback http origins are allowed.');
  return origin;
}

function watchOnline(
  deps: Pick<StartDependencies<WindowPort>, 'isOnline' | 'onResume'>,
  window: WindowPort,
  reconnect: () => void,
): void {
  watchConnectivity({
    isOnline: deps.isOnline,
    onResume: deps.onResume,
    every: setInterval,
    schedule: setTimeout,
    onChange: offlineTitle(window, PRODUCT_NAME),
    reconnect,
  });
}

/** Opens the WhatsApp window where the user left it. */
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
  if (instances === undefined) return;
  quitOnShutdown(deps.shutdown, () => {
    app.quit();
  });
  const views: ViewRegistry = new WeakMap();
  const identity = {
    userAgent: chromeUserAgent(deps.platform, deps.chromeVersion),
    chromeVersion: deps.chromeVersion,
  };
  const picker = latePicker();
  const security = { ...deps, capture: deps.capture(picker.pick), views, identity };
  const graphics = beforeReady(deps, security);

  await app.whenReady();
  secureSession(deps.defaultSession(), security);
  guardDownloads(deps.defaultSession(), { ...deps.downloads, notify: deps.notify, warn });
  followThemeSetting(deps.nativeTheme, deps.settings);
  const chrome = deps.chrome.afterReady(views, warn, describeGraphics(graphics));
  picker.bind(chrome.pickCaptureSource);
  announceStartup(deps, graphics);
  const window = openMainWindow(deps);
  views.set(window.webContents, { zone: 'whatsapp', home: origin, label: 'WhatsApp' });
  const recovery = chrome.attachRecovery(window.webContents, origin, (renderer) =>
    deps.createOverlay(window, renderer),
  );
  watchOnline(deps, window, recovery.reconnect);
  followZoomSetting(window.webContents, deps.settings);
  showWhenReady(window);
  instances.attach(window);
  // A failed load must not end startup: the monitor shows the recovery screen.
  await window.loadURL(chatLinkInArguments(deps.argv, origin) ?? origin).catch(() => undefined);
}
