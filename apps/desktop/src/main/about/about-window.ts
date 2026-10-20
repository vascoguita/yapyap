import { CHROME_ORIGIN } from '../chrome/assets.ts';
import type { ViewRegistry } from '../views.ts';
import type { WindowOptions } from '../windows.ts';

export interface AboutWindowPort {
  readonly webContents: object;
  isDestroyed(): boolean;
  focus(): void;
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface AboutWindowDependencies {
  readonly createWindow: (options: WindowOptions) => AboutWindowPort;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
}

/** Opens the About window, or focuses it when it is already open. */
export function createAboutOpener(deps: AboutWindowDependencies): () => void {
  let current: AboutWindowPort | undefined;
  return () => {
    if (current !== undefined && !current.isDestroyed()) {
      current.focus();
      return;
    }
    const window = deps.createWindow({
      title: 'About YapYap',
      width: 480,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    current = window;
    deps.views.set(window.webContents, { zone: 'chrome', home: CHROME_ORIGIN, label: 'YapYap' });
    window.once('ready-to-show', () => {
      window.show();
    });
    window.loadURL(`${CHROME_ORIGIN}/about.html`).catch(() => {
      deps.warn('Could not load the About window.');
    });
  };
}
