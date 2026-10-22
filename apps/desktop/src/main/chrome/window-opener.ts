import { showWhenReady } from '../show-when-ready.ts';
import type { ViewRegistry } from '../views.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_ORIGIN } from './assets.ts';
import { PRODUCT_NAME } from '../identity.ts';

export interface ChromeWindowPort {
  readonly webContents: object;
  isDestroyed(): boolean;
  focus(): void;
  once(event: 'ready-to-show' | 'closed', listener: () => void): unknown;
  close(): void;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface ChromeWindowDependencies {
  readonly createWindow: (options: WindowOptions) => ChromeWindowPort;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
}

/** A chrome page that opens in its own window, such as About or Settings. */
export interface ChromePage {
  /** Relative to `app://chrome/`. */
  readonly path: string;
  readonly window: WindowOptions;
}

/** Opens `page` in a new chrome window, shown once it has rendered or after a short wait. */
export function openChromeWindow(
  deps: ChromeWindowDependencies,
  page: ChromePage,
  extra: WindowOptions = {},
): ChromeWindowPort {
  // Dialog-like windows have no use for the app menu, which Windows and Linux
  // would otherwise draw inside each of them.
  const window = deps.createWindow({
    autoHideMenuBar: true,
    ...page.window,
    ...extra,
    show: false,
  });
  deps.views.set(window.webContents, { zone: 'chrome', home: CHROME_ORIGIN, label: PRODUCT_NAME });
  showWhenReady(window);
  window.loadURL(`${CHROME_ORIGIN}/${page.path}`).catch(() => {
    deps.warn(`Could not load ${page.path}.`);
  });
  return window;
}

/** Opens `page` in a chrome window, or focuses that window when it is already open. */
export function createChromeWindowOpener(
  deps: ChromeWindowDependencies,
  page: ChromePage,
): () => void {
  let current: ChromeWindowPort | undefined;
  return () => {
    if (current !== undefined && !current.isDestroyed()) {
      current.focus();
      return;
    }
    current = openChromeWindow(deps, page);
  };
}
