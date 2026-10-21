import type { MenuItemConstructorOptions } from 'electron';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import {
  buildAboutInfo,
  formatDiagnostics,
  formatTechnicalDetails,
  summarizeGpu,
  type RuntimeFacts,
} from '../about/about-info.ts';
import {
  createSourcePicker,
  type DesktopSource,
  type SourceKind,
  type SourcePicker,
} from '../capture/picker.ts';
import { changeZoom } from '../appearance/zoom.ts';
import { buildMenuTemplate, type MenuActions } from '../menu.ts';
import {
  createRecovery,
  type Overlay,
  type RecoverableContents,
  type Recovery,
} from '../recovery/controller.ts';
import { guardCrashes, type CrashableContents } from '../recovery/crash-guard.ts';
import { monitorPage, type MonitoredContents } from '../recovery/monitor.ts';
import { settingsHandlers } from '../settings/handlers.ts';
import type { SettingsService } from '../settings/service.ts';
import { settingsTransferHandlers, type SettingsFiles } from '../settings/transfer-handlers.ts';
import type { ViewRegistry } from '../views.ts';
import type { RendererOptions } from '../web-preferences.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_SCHEME, createChromeHandler } from './assets.ts';
import {
  NO_ARGUMENTS,
  registerChromeHandlers,
  type ChromeCall,
  type ChromeHandler,
  type IpcMainPort,
} from './ipc.ts';
import {
  createChromeWindowOpener,
  openChromeWindow,
  type ChromePage,
  type ChromeWindowDependencies,
  type ChromeWindowPort,
} from './window-opener.ts';

/** In memory only: app chrome never shares storage with WhatsApp or keeps any. */
export const CHROME_PARTITION = 'yapyap-chrome';

const ABOUT_PAGE: ChromePage = {
  path: 'about.html',
  window: {
    title: 'About YapYap',
    width: 480,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

const PICKER_PAGE: ChromePage = {
  path: 'picker.html',
  window: {
    title: 'Share your screen',
    width: 760,
    height: 580,
    minWidth: 480,
    minHeight: 400,
    minimizable: false,
    modal: true,
  },
};

const SETTINGS_PAGE: ChromePage = {
  path: 'settings.html',
  window: { title: 'YapYap Settings', width: 640, height: 560, minWidth: 420, minHeight: 360 },
};

interface PrivilegedScheme {
  readonly scheme: string;
  readonly privileges: { readonly standard: boolean; readonly secure: boolean };
}

export interface ChromeFeatureDependencies {
  readonly registerSchemesAsPrivileged: (schemes: readonly PrivilegedScheme[]) => void;
  readonly chromeProtocol: () => {
    handle(scheme: string, handler: (request: { readonly url: string }) => Promise<Response>): void;
  };
  readonly ipc: IpcMainPort;
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => ChromeWindowPort;
  readonly setMenu: (template: MenuItemConstructorOptions[]) => void;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  /** A system notification, for things the user should know but need not act on. */
  readonly notify: (message: string) => void;
  /** `app.getGPUFeatureStatus()`, summarized for diagnostics. */
  readonly gpuStatus: () => Readonly<Record<string, string>>;
  /** The recent, already redacted log lines. */
  readonly recentLog: () => readonly string[];
  /** Everything but the graphics mode, which is only settled at startup. */
  readonly facts: () => Omit<RuntimeFacts, 'graphics'>;
  readonly platform: string;
  readonly rendererRoot: string;
  readonly preloadPath: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly settings: SettingsService;
  readonly settingsFiles: SettingsFiles;
  /** Quits and starts YapYap again, to apply settings that need a restart. */
  readonly restart: () => void;
  /** Asks before logging the account out; true when the user agrees. */
  readonly confirmReset: () => Promise<boolean>;
  readonly captureSources: (kind: SourceKind) => Promise<readonly DesktopSource[]>;
  /** The window showing `contents`, so the picker can sit on top of it. */
  readonly windowOf: (contents: object) => WindowOptions['parent'] | null;
}

export type WhatsAppContents = MonitoredContents & RecoverableContents & CrashableContents;

interface ChromeRuntime {
  /** Watches a WhatsApp view and shows the recovery screen over it when it fails. */
  readonly attachRecovery: (
    contents: WhatsAppContents,
    origin: string,
    createOverlay: (renderer: RendererOptions) => Overlay,
  ) => Pick<Recovery, 'reconnect'>;
  /** YapYap's screen-sharing picker, for platforms without a system one. */
  readonly pickCaptureSource: SourcePicker['pick'];
}

export interface ChromeFeature {
  /** Must run before the app is ready, when custom schemes can still be registered. */
  readonly beforeReady: () => void;
  /** `graphics` describes the rendering mode startup settled on, for diagnostics. */
  readonly afterReady: (
    views: ViewRegistry,
    warn: (message: string) => void,
    graphics: string,
  ) => ChromeRuntime;
}

type FactsSource = Pick<ChromeFeatureDependencies, 'writeClipboard'> & {
  readonly facts: () => RuntimeFacts;
};

function aboutHandlers(deps: FactsSource): ChromeHandler[] {
  const info = () => buildAboutInfo(deps.facts());
  return [
    { channel: CHROME_CHANNELS.aboutInfo, accepts: NO_ARGUMENTS, handle: info },
    {
      channel: CHROME_CHANNELS.copyTechnicalDetails,
      accepts: NO_ARGUMENTS,
      handle: () => deps.writeClipboard(formatTechnicalDetails(info())),
    },
  ];
}

function recoveryHandlers(recoveries: readonly Recovery[]): ChromeHandler[] {
  const of = ({ sender }: ChromeCall): Recovery => {
    const recovery = recoveries.find((candidate) => candidate.owns(sender));
    if (recovery === undefined) throw new Error('No recovery screen belongs to this window.');
    return recovery;
  };
  const operation = (channel: string, run: (recovery: Recovery) => unknown): ChromeHandler => ({
    channel,
    accepts: NO_ARGUMENTS,
    handle: (call) => run(of(call)),
  });
  return [
    operation(CHROME_CHANNELS.recoveryProblem, (recovery) => recovery.problem()),
    operation(CHROME_CHANNELS.recoveryRetry, (recovery) => recovery.retry()),
    operation(CHROME_CHANNELS.recoveryClearCache, (recovery) => recovery.clearCacheAndRetry()),
    operation(CHROME_CHANNELS.recoveryCopyDiagnostics, (recovery) => recovery.copyDiagnostics()),
  ];
}

function recoveryAttacher(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  recoveries: Recovery[],
): ChromeRuntime['attachRecovery'] {
  const technicalDetails = () => diagnostics(deps);
  return (contents, origin, createOverlay) => {
    const recovery = createRecovery({
      contents,
      origin,
      createOverlay: () => createOverlay(renderer),
      views,
      writeClipboard: deps.writeClipboard,
      technicalDetails,
      warn,
    });
    recoveries.push(recovery);
    monitorPage(contents, { onFailure: recovery.show, schedule: setTimeout, warn });
    guardCrashes(contents, {
      now: Date.now,
      schedule: setTimeout,
      notify: deps.notify,
      showFailure: recovery.show,
      warn,
    });
    return recovery;
  };
}

function sourcePicker(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
): SourcePicker {
  return createSourcePicker({
    getSources: deps.captureSources,
    offerAudio: deps.platform === 'win32',
    wait: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    openPicker: (owner) => {
      const parent = deps.windowOf(owner);
      const window = openChromeWindow(windows, PICKER_PAGE, parent == null ? {} : { parent });
      return {
        webContents: window.webContents,
        close: () => {
          if (!window.isDestroyed()) window.close();
        },
        onClosed: (listener) => {
          window.once('closed', listener);
        },
      };
    },
  });
}

/** Acts on the WhatsApp view; there is one per window until accounts arrive. */
function accountActions(
  deps: ChromeFeatureDependencies,
  recoveries: readonly Recovery[],
  warn: (message: string) => void,
): Pick<MenuActions, 'clearCache' | 'resetSession'> {
  const failed = (): void => {
    warn('Could not finish an account maintenance action.');
  };
  return {
    clearCache: () => {
      recoveries[0]?.clearCacheAndRetry().catch(failed);
    },
    resetSession: () => {
      deps
        .confirmReset()
        .then((confirmed) => (confirmed ? recoveries[0]?.resetSession() : undefined))
        .catch(failed);
    },
  };
}

function diagnostics(deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource): string {
  return formatDiagnostics(
    buildAboutInfo(deps.facts()),
    summarizeGpu(deps.gpuStatus()),
    deps.recentLog(),
  );
}

function chromeWindows(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
): ChromeWindowDependencies {
  return { createWindow: (options) => deps.createWindow(options, renderer), views, warn };
}

function setMenu(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
  recoveries: readonly Recovery[],
  warn: (message: string) => void,
  copyDiagnostics: () => void,
): void {
  const opener = (page: ChromePage) => createChromeWindowOpener(windows, page);
  deps.setMenu(
    buildMenuTemplate(deps.platform, {
      openAbout: opener(ABOUT_PAGE),
      openSettings: opener(SETTINGS_PAGE),
      ...accountActions(deps, recoveries, warn),
      zoom: (step) => {
        changeZoom(deps.settings, step);
      },
      copyDiagnostics,
    }),
  );
}

export function createChromeFeature(deps: ChromeFeatureDependencies): ChromeFeature {
  const renderer = { preload: deps.preloadPath, partition: CHROME_PARTITION };
  return {
    beforeReady: () => {
      deps.registerSchemesAsPrivileged([
        { scheme: CHROME_SCHEME, privileges: { standard: true, secure: true } },
      ]);
    },
    afterReady: (views, warn, graphics) => {
      const withGraphics = { ...deps, facts: () => ({ ...deps.facts(), graphics }) };
      const handler = createChromeHandler(deps.rendererRoot, deps.readFile);
      deps.chromeProtocol().handle(CHROME_SCHEME, handler);
      const recoveries: Recovery[] = [];
      const windows = chromeWindows(deps, renderer, views, warn);
      const picker = sourcePicker(deps, windows);
      registerChromeHandlers(
        deps.ipc,
        views,
        [
          ...aboutHandlers(withGraphics),
          ...recoveryHandlers(recoveries),
          ...settingsHandlers(deps.settings, deps.restart, deps.platform),
          ...settingsTransferHandlers(deps.settings, deps.settingsFiles),
          ...picker.handlers,
        ],
        warn,
      );
      setMenu(deps, windows, recoveries, warn, () => {
        deps.writeClipboard(diagnostics(withGraphics)).catch(() => {
          warn('Could not copy the diagnostics.');
        });
      });
      return {
        attachRecovery: recoveryAttacher(withGraphics, renderer, views, warn, recoveries),
        pickCaptureSource: picker.pick,
      };
    },
  };
}
