/**
 * `ready-to-show` is not guaranteed to fire (for example without a compositor,
 * or with software rendering), and a window that never appears looks like a
 * hung app.
 */
export const SHOW_FALLBACK_MS = 3000;

export interface ShowableWindow {
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
}

/**
 * A page in a view of the window. The window's own page then stays empty
 * and never sends `ready-to-show`, so the view's page says when to show.
 */
export interface ReadyPage {
  once(event: 'dom-ready' | 'did-fail-load', listener: () => void): unknown;
}

/**
 * Shows the window once it has rendered, or after a short wait at the latest.
 * Started minimized, it stays hidden until the tray, the Dock or a second
 * launch shows it.
 */
export function showWhenReady(
  window: ShowableWindow,
  startMinimized = false,
  page?: ReadyPage,
): void {
  if (startMinimized) {
    return;
  }
  let shown = false;
  const showOnce = (): void => {
    if (shown) {
      return;
    }
    shown = true;
    window.show();
  };
  if (page === undefined) {
    window.once('ready-to-show', showOnce);
  } else {
    page.once('dom-ready', showOnce);
    // A page that failed to load shows the recovery screen, which must be seen.
    page.once('did-fail-load', showOnce);
  }
  setTimeout(showOnce, SHOW_FALLBACK_MS);
}
