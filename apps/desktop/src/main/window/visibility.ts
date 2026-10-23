export interface VisibilityWindow {
  isVisible(): boolean;
  isMinimized(): boolean;
  // Separate signatures, as Electron declares them, so a BrowserWindow fits.
  on: ((event: 'show', listener: () => void) => unknown) &
    ((event: 'hide', listener: () => void) => unknown) &
    ((event: 'minimize', listener: () => void) => unknown) &
    ((event: 'restore', listener: () => void) => unknown) &
    ((event: 'focus', listener: () => void) => unknown);
}

export interface Visibility {
  /** Shown, even if minimized: what the tray's Show and Hide follow. */
  readonly visible: () => boolean;
  /** Shown and not minimized: the user can see the window's content. */
  readonly onScreen: () => boolean;
}

/** How long macOS takes to report a window's new state after its event. */
const SETTLE_MS = 250;

/**
 * Asks the window, but trusts a `hide` or `minimize` event over the answer
 * until the window comes back: macOS still reports a window as visible while
 * its `hide` event runs. The events alone are not enough either, since macOS
 * does not always send `show` for a window's first appearance, so each
 * change is looked at again once the window has settled.
 */
export function trackVisibility(window: VisibilityWindow, onChange: () => void): Visibility {
  let hidden = false;
  let minimized = false;
  const set = (change: () => void) => () => {
    change();
    onChange();
    setTimeout(onChange, SETTLE_MS);
  };
  const back = set(() => {
    hidden = false;
    minimized = false;
  });
  window.on('show', back);
  window.on('focus', back);
  window.on(
    'restore',
    set(() => {
      minimized = false;
    }),
  );
  window.on(
    'hide',
    set(() => {
      hidden = true;
    }),
  );
  window.on(
    'minimize',
    set(() => {
      minimized = true;
    }),
  );
  const visible = (): boolean => !hidden && window.isVisible();
  return { visible, onScreen: () => visible() && !minimized && !window.isMinimized() };
}
