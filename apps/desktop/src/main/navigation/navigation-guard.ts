import type { WebPreferences } from 'electron';
import { classifyLink, isSameOrigin } from './link-policy.ts';

/**
 * WhatsApp sometimes opens `about:blank` and only then sets the popup's
 * location. A popup that never navigates is discarded after this long.
 */
export const TRANSIENT_POPUP_MS = 5000;

interface NavigationEvent {
  readonly url: string;
  readonly isMainFrame: boolean;
  preventDefault(): void;
}

export type WindowOpenResponse =
  | { readonly action: 'deny' }
  | {
      readonly action: 'allow';
      readonly overrideBrowserWindowOptions: {
        readonly show: false;
        readonly webPreferences: WebPreferences;
      };
    };

export interface PopupWindow {
  readonly webContents: {
    once(event: 'will-navigate', listener: () => void): unknown;
  };
  isDestroyed(): boolean;
  destroy(): void;
}

export interface NavigationContents {
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent) => void): unknown;
  on(event: 'did-create-window', listener: (window: PopupWindow) => void): unknown;
  setWindowOpenHandler(handler: (details: { readonly url: string }) => WindowOpenResponse): void;
  loadURL(url: string): Promise<unknown>;
}

export interface NavigationDependencies {
  /** The origin a web contents was created for; undefined for popups and DevTools. */
  readonly homeOf: (contents: NavigationContents) => string | undefined;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly popupPreferences: () => WebPreferences;
  readonly warn: (message: string) => void;
  readonly schedule: (callback: () => void, ms: number) => unknown;
}

function follow(contents: NavigationContents, url: string, deps: NavigationDependencies): void {
  const action = classifyLink(url, deps.homeOf(contents));
  // Failures are logged without the URL, which can contain phone numbers.
  const report = (): void => {
    deps.warn(`Could not open a ${action.kind} link.`);
  };
  if (action.kind === 'external') deps.openExternal(action.url).catch(report);
  if (action.kind === 'deep-link') contents.loadURL(action.url).catch(report);
}

function adoptPopup(popup: PopupWindow, deps: NavigationDependencies): void {
  const discard = (): void => {
    if (!popup.isDestroyed()) popup.destroy();
  };
  // The popup's own navigation guard has already routed the link by now.
  popup.webContents.once('will-navigate', discard);
  deps.schedule(discard, TRANSIENT_POPUP_MS);
}

/**
 * Keeps each view on its home origin, sends links to the browser or the
 * mail and phone apps through the link policy, and never opens app windows.
 */
export function createNavigationGuard(
  deps: NavigationDependencies,
): (contents: NavigationContents) => void {
  return (contents) => {
    contents.on('will-navigate', (event) => {
      if (!event.isMainFrame || isSameOrigin(event.url, deps.homeOf(contents))) return;
      event.preventDefault();
      follow(contents, event.url, deps);
    });
    contents.on('will-redirect', (event) => {
      // A redirect is not a click, so it is blocked rather than opened elsewhere.
      if (event.isMainFrame && !isSameOrigin(event.url, deps.homeOf(contents)))
        event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (url === 'about:blank' || url === '') {
        const webPreferences = deps.popupPreferences();
        return { action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences } };
      }
      follow(contents, url, deps);
      return { action: 'deny' };
    });
    contents.on('did-create-window', (popup) => {
      adoptPopup(popup, deps);
    });
  };
}
