/** Electron's `app.dock`, which only macOS has. */
export interface DockPort {
  hide(): void;
  show(): Promise<void>;
}

export interface DockDependencies {
  /** Undefined off macOS, where there is no Dock to leave. */
  readonly dock: DockPort | undefined;
  /** Brings YapYap to the front, as `app.focus({ steal: true })` does. */
  readonly focus: () => void;
  readonly warn: (message: string) => void;
}

/**
 * Lets YapYap live in the menu bar alone on macOS (#708), as Start in the
 * background and Close to the menu bar ask: the Dock icon goes while the
 * window is out of sight, and comes back once the window shows. Returns
 * what takes the icon off the Dock.
 */
export function dockFollowsWindow(
  window: { on(event: 'show', listener: () => void): unknown },
  deps: DockDependencies,
): () => void {
  const { dock } = deps;
  if (dock === undefined) {
    return () => undefined;
  }
  let left = false;
  window.on('show', () => {
    if (!left) {
      return;
    }
    left = false;
    // An app without a Dock icon cannot hold the front, so the window shown
    // from the menu bar would sit behind the app in use until YapYap takes it.
    dock.show().then(deps.focus, () => {
      deps.warn('Could not show YapYap in the Dock again.');
    });
  });
  return () => {
    left = true;
    dock.hide();
  };
}
