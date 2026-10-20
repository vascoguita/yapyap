import type { MenuItemConstructorOptions } from 'electron';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { buildAboutInfo, formatTechnicalDetails, type RuntimeFacts } from '../about/about-info.ts';
import { buildMenuTemplate } from '../menu.ts';
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
  type ChromePage,
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
  /** Everything but the graphics mode, which is only settled at startup. */
  readonly facts: () => Omit<RuntimeFacts, 'graphics'>;
  readonly platform: string;
  readonly rendererRoot: string;
  readonly preloadPath: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly settings: SettingsService;
  /** Quits and starts YapYap again, to apply settings that need a restart. */
  readonly restart: () => void;
}

export type WhatsAppContents = MonitoredContents & RecoverableContents & CrashableContents;

interface ChromeRuntime {
  /** Watches a WhatsApp view and shows the recovery screen over it when it fails. */
  readonly attachRecovery: (
    contents: WhatsAppContents,
    origin: string,
    createOverlay: (renderer: RendererOptions) => Overlay,
  ) => Pick<Recovery, 'reconnect'>;
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
  const technicalDetails = () => formatTechnicalDetails(buildAboutInfo(deps.facts()));
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
      registerChromeHandlers(
        deps.ipc,
        views,
        [
          ...aboutHandlers(withGraphics),
          ...recoveryHandlers(recoveries),
          ...settingsHandlers(deps.settings, deps.restart),
        ],
        warn,
      );
      const createWindow = (options: WindowOptions) => deps.createWindow(options, renderer);
      const opener = (page: ChromePage) =>
        createChromeWindowOpener({ createWindow, views, warn }, page);
      deps.setMenu(
        buildMenuTemplate(deps.platform, {
          openAbout: opener(ABOUT_PAGE),
          openSettings: opener(SETTINGS_PAGE),
        }),
      );
      return { attachRecovery: recoveryAttacher(withGraphics, renderer, views, warn, recoveries) };
    },
  };
}
