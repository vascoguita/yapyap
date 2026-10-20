import type { MenuItemConstructorOptions } from 'electron';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { buildAboutInfo, formatTechnicalDetails, type RuntimeFacts } from '../about/about-info.ts';
import { createAboutOpener, type AboutWindowPort } from '../about/about-window.ts';
import { buildMenuTemplate } from '../menu.ts';
import type { ViewRegistry } from '../views.ts';
import type { RendererOptions } from '../web-preferences.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_SCHEME, createChromeHandler } from './assets.ts';
import { NO_ARGUMENTS, registerChromeHandlers, type IpcMainPort } from './ipc.ts';

/** In memory only: app chrome never shares storage with WhatsApp or keeps any. */
export const CHROME_PARTITION = 'yapyap-chrome';

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
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => AboutWindowPort;
  readonly setMenu: (template: MenuItemConstructorOptions[]) => void;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  readonly facts: () => RuntimeFacts;
  readonly platform: string;
  readonly rendererRoot: string;
  readonly preloadPath: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
}

export interface ChromeFeature {
  /** Must run before the app is ready, when custom schemes can still be registered. */
  readonly beforeReady: () => void;
  readonly afterReady: (views: ViewRegistry, warn: (message: string) => void) => void;
}

export function createChromeFeature(deps: ChromeFeatureDependencies): ChromeFeature {
  return {
    beforeReady: () => {
      deps.registerSchemesAsPrivileged([
        { scheme: CHROME_SCHEME, privileges: { standard: true, secure: true } },
      ]);
    },
    afterReady: (views, warn) => {
      deps
        .chromeProtocol()
        .handle(CHROME_SCHEME, createChromeHandler(deps.rendererRoot, deps.readFile));
      const info = () => buildAboutInfo(deps.facts());
      registerChromeHandlers(
        deps.ipc,
        views,
        [
          { channel: CHROME_CHANNELS.aboutInfo, accepts: NO_ARGUMENTS, handle: info },
          {
            channel: CHROME_CHANNELS.copyTechnicalDetails,
            accepts: NO_ARGUMENTS,
            handle: () => deps.writeClipboard(formatTechnicalDetails(info())),
          },
        ],
        warn,
      );
      const renderer = { preload: deps.preloadPath, partition: CHROME_PARTITION };
      const openAbout = createAboutOpener({
        createWindow: (options) => deps.createWindow(options, renderer),
        views,
        warn,
      });
      deps.setMenu(buildMenuTemplate(deps.platform, openAbout));
    },
  };
}
