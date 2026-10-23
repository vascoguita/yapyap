export interface VisibilityWindow {
  isVisible(): boolean;
  isMinimized(): boolean;
  // Separate signatures, as Electron declares them, so a BrowserWindow fits.
  on: ((event: 'show', listener: () => void) => unknown) &
    ((event: 'hide', listener: () => void) => unknown) &
    ((event: 'minimize', listener: () => void) => unknown) &
    ((event: 'restore', listener: () => void) => unknown);
}

export interface Visibility {
  /** Shown, even if minimized: what the tray's Show and Hide follow. */
  readonly visible: () => boolean;
  /** Shown and not minimized: the user can see the window's content. */
  readonly onScreen: () => boolean;
}

/**
 * Follows the window's events rather than asking it: macOS still reports a
 * window as visible while its `hide` event runs, so listeners that asked
 * would act on the old state.
 */
export function trackVisibility(window: VisibilityWindow, onChange: () => void): Visibility {
  let visible = window.isVisible();
  let minimized = window.isMinimized();
  const set = (change: () => void) => () => {
    change();
    onChange();
  };
  window.on(
    'show',
    set(() => {
      visible = true;
    }),
  );
  window.on(
    'hide',
    set(() => {
      visible = false;
    }),
  );
  window.on(
    'minimize',
    set(() => {
      minimized = true;
    }),
  );
  window.on(
    'restore',
    set(() => {
      minimized = false;
    }),
  );
  return { visible: () => visible, onScreen: () => visible && !minimized };
}
