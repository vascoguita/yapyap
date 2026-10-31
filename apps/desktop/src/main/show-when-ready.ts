/**
 * `ready-to-show` is not guaranteed to fire (for example without a compositor,
 * or with software rendering), and a window that never appears looks like a
 * hung app.
 */
export const SHOW_FALLBACK_MS = 3000;

interface Showable {
  show(): void;
}

export interface ShowableWindow extends Showable {
  once(event: 'ready-to-show', listener: () => void): unknown;
}

/**
 * A page in a view of the main window, which has no page of its own and so
 * never sends `ready-to-show`: the view's page says when to show.
 */
export interface ReadyPage {
  once(event: 'dom-ready' | 'did-fail-load', listener: () => void): unknown;
}

/** Shows `window` the first time `when` calls back, or after a short wait at the latest. */
function showOnce(window: Showable, when: (show: () => void) => void): void {
  let shown = false;
  const show = (): void => {
    if (!shown) {
      shown = true;
      window.show();
    }
  };
  when(show);
  setTimeout(show, SHOW_FALLBACK_MS);
}

/** Shows a window with a page of its own once that page has rendered. */
export function showWhenReady(window: ShowableWindow): void {
  showOnce(window, (show) => window.once('ready-to-show', show));
}

/**
 * Shows the main window once `page` has loaded. Started minimized, it stays
 * hidden until the tray, the Dock or a second launch shows it.
 */
export function showWhenPageReady(
  window: Showable,
  startMinimized: boolean,
  page: ReadyPage,
): void {
  if (startMinimized) {
    return;
  }
  showOnce(window, (show) => {
    page.once('dom-ready', show);
    // A page that failed to load shows the recovery screen, which must be seen.
    page.once('did-fail-load', show);
  });
}
