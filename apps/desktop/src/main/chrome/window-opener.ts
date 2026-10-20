import type { ViewRegistry } from '../views.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_ORIGIN } from './assets.ts';

export interface ChromeWindowPort {
  readonly webContents: object;
  isDestroyed(): boolean;
  focus(): void;
  once(event: 'ready-to-show', listener: () => void): unknown;
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
    const window = deps.createWindow({ ...page.window, show: false });
    current = window;
    deps.views.set(window.webContents, { zone: 'chrome', home: CHROME_ORIGIN, label: 'YapYap' });
    window.once('ready-to-show', () => {
      window.show();
    });
    window.loadURL(`${CHROME_ORIGIN}/${page.path}`).catch(() => {
      deps.warn(`Could not load ${page.path}.`);
    });
  };
}
