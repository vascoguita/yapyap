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

/** Shows the window once it has rendered, or after a short wait at the latest. */
export function showWhenReady(window: ShowableWindow): void {
  let shown = false;
  const showOnce = (): void => {
    if (shown) {
      return;
    }
    shown = true;
    window.show();
  };
  window.once('ready-to-show', showOnce);
  setTimeout(showOnce, SHOW_FALLBACK_MS);
}
