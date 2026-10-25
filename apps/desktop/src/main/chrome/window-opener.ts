import { showWhenReady } from '../show-when-ready.ts';
import type { ViewRegistry } from '../views.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_ORIGIN } from './assets.ts';
import { PRODUCT_NAME } from '../identity.ts';

export interface ChromeWindowPort {
  /** Where YapYap tells the page that something it shows has changed. */
  readonly webContents: { send(channel: string, ...args: never[]): void };
  isDestroyed(): boolean;
  focus(): void;
  once(event: 'ready-to-show' | 'closed', listener: () => void): unknown;
  close(): void;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface ChromeWindowDependencies<Window extends ChromeWindowPort = ChromeWindowPort> {
  readonly createWindow: (options: WindowOptions) => Window;
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
export function openChromeWindow<Window extends ChromeWindowPort>(
  deps: ChromeWindowDependencies<Window>,
  page: ChromePage,
  extra: WindowOptions = {},
): Window {
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

/** A chrome window opened at most once, which YapYap can tell about changes while it is open. */
export interface ChromeWindowSlot {
  /** Opens the window, or focuses it when it is already open. */
  readonly open: () => void;
  /** Sends `channel` to the window's page, if the window is open. */
  readonly notify: (channel: string) => void;
}

export function createChromeWindowSlot(
  deps: ChromeWindowDependencies,
  page: ChromePage,
): ChromeWindowSlot {
  let current: ChromeWindowPort | undefined;
  const open = (): ChromeWindowPort | undefined =>
    current !== undefined && !current.isDestroyed() ? current : undefined;
  return {
    open: () => {
      const shown = open();
      if (shown === undefined) {
        current = openChromeWindow(deps, page);
      } else {
        shown.focus();
      }
    },
    notify: (channel) => {
      open()?.webContents.send(channel);
    },
  };
}

/** Opens `page` in a chrome window, or focuses that window when it is already open. */
export function createChromeWindowOpener(
  deps: ChromeWindowDependencies,
  page: ChromePage,
): () => void {
  return createChromeWindowSlot(deps, page).open;
}

/** A window that asks one question and goes away once answered or closed. */
export interface PromptWindow {
  readonly webContents: object;
  close(): void;
  /** Called once the window is gone, however it was closed. */
  onClosed(listener: () => void): void;
}

/** Opens `page` as a prompt window, which closing twice cannot break. */
export function openPromptWindow(deps: ChromeWindowDependencies, page: ChromePage): PromptWindow {
  const window = openChromeWindow(deps, page);
  return {
    webContents: window.webContents,
    close: () => {
      if (!window.isDestroyed()) {
        window.close();
      }
    },
    onClosed: (listener) => {
      window.once('closed', listener);
    },
  };
}
