import type { ChromeFeature, WhatsAppContents } from './chrome/feature.ts';
import { watchConnectivity } from './connectivity/connectivity.ts';
import { offlineTitle, type TitledWindow } from './connectivity/offline-title.ts';
import { APP_ID, PRODUCT_NAME } from './identity.ts';
import type { DisplayCapturePort, MediaType } from './permissions/session-guard.ts';
import { chromeUserAgent } from './identity/user-agent.ts';
import { guardGpu } from './recovery/gpu-safe-mode.ts';
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
import { resolveWhatsAppOrigin } from './whatsapp-origin.ts';

/**
 * `ready-to-show` is not guaranteed to fire (for example without a compositor),
 * and a window that never appears looks like a hung app.
 */
export const SHOW_FALLBACK_MS = 3000;

export interface AppPort {
  disableHardwareAcceleration(): void;
  userAgentFallback: string;
  enableSandbox(): void;
  whenReady(): Promise<unknown>;
  setAppUserModelId(id: string): void;
  on(event: 'window-all-closed', listener: () => void): unknown;
  on(
    event: 'child-process-gone',
    listener: (event: unknown, details: { readonly type: string; readonly reason: string }) => void,
  ): unknown;
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
  on(event: 'session-created', listener: (session: GuardedSession) => void): unknown;
  quit(): void;
}

export interface WindowPort extends TitledWindow {
  readonly webContents: WhatsAppContents;
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface StartDependencies<Window extends WindowPort> {
  readonly app: AppPort;
  readonly createWindow: (options: WindowOptions) => Window;
  readonly createOverlay: (window: Window, renderer: RendererOptions) => Overlay;
  readonly defaultSession: () => GuardedSession;
  /** `process.versions.chrome`: the identity must match the bundled engine. */
  readonly chromeVersion: string;
  readonly platform: string;
  readonly askMedia: (view: ViewInfo, mediaTypes: readonly MediaType[]) => Promise<boolean>;
  readonly capture: DisplayCapturePort;
  readonly chrome: ChromeFeature;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly isOnline: () => boolean;
  readonly onResume: (listener: () => void) => void;
  readonly gpuCrashLog: { readonly read: () => string; readonly write: (text: string) => void };
  readonly settings: SettingsService;
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
}

const MAIN_WINDOW: WindowOptions = {
  title: PRODUCT_NAME,
  width: 1200,
  height: 800,
  minWidth: 640,
  minHeight: 480,
  show: false,
};

function showWhenReady(window: WindowPort): void {
  let shown = false;
  const showOnce = (): void => {
    if (shown) return;
    shown = true;
    window.show();
  };
  window.once('ready-to-show', showOnce);
  setTimeout(showOnce, SHOW_FALLBACK_MS);
}

/** Everything Electron only accepts before the app is ready. */
function beforeReady<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  security: SecurityDependencies,
): void {
  const { app, warn } = deps;
  app.userAgentFallback = security.identity.userAgent;
  // Sandboxes the renderers Electron creates on its own too.
  app.enableSandbox();
  if (!deps.settings.current().reliability.hardwareAcceleration) app.disableHardwareAcceleration();
  guardGpu(app, {
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
}

export async function startApp<Window extends WindowPort>(
  deps: StartDependencies<Window>,
): Promise<void> {
  const { app, createWindow, env, warn } = deps;
  const views: ViewRegistry = new WeakMap();
  const identity = {
    userAgent: chromeUserAgent(deps.platform, deps.chromeVersion),
    chromeVersion: deps.chromeVersion,
  };
  const security = { ...deps, views, identity };
  beforeReady(deps, security);

  const { origin, rejectedOverride } = resolveWhatsAppOrigin(env['YAPYAP_TEST_WHATSAPP_ORIGIN']);
  if (rejectedOverride)
    warn('Ignoring YAPYAP_TEST_WHATSAPP_ORIGIN: only loopback http origins are allowed.');

  await app.whenReady();
  secureSession(deps.defaultSession(), security);
  const chrome = deps.chrome.afterReady(views, warn);
  if (deps.settings.notice !== undefined) deps.notify(deps.settings.notice);
  const window = createWindow(MAIN_WINDOW);
  views.set(window.webContents, { zone: 'whatsapp', home: origin, label: 'WhatsApp' });
  const recovery = chrome.attachRecovery(window.webContents, origin, (renderer) =>
    deps.createOverlay(window, renderer),
  );
  watchConnectivity({
    isOnline: deps.isOnline,
    onResume: deps.onResume,
    every: setInterval,
    schedule: setTimeout,
    onChange: offlineTitle(window, PRODUCT_NAME),
    reconnect: recovery.reconnect,
  });
  showWhenReady(window);
  // A failed load must not end startup: the monitor shows the recovery screen.
  await window.loadURL(origin).catch(() => undefined);
}
