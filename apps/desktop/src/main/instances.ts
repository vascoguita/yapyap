import { chatLinkInArguments, chatLinkTarget } from './navigation/deep-link.ts';

export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: readonly string[]) => void,
  ): unknown;
  on(
    event: 'open-url',
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): unknown;
}

export interface LinkWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface Instances {
  /** Hands chat links to the WhatsApp window, including any that arrived before it. */
  readonly attach: (window: LinkWindow) => void;
}

function bringToFront(window: LinkWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * Makes this the only running YapYap for its profile, or returns nothing
 * after quitting so the first instance handles the launch. Later launches
 * focus the window and pass on a valid chat link; nothing else from their
 * command line is trusted.
 */
export function claimSingleInstance(
  app: InstanceApp,
  home: string,
  warn: (message: string) => void,
): Instances | undefined {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return undefined;
  }
  let window: LinkWindow | undefined;
  let pending: string | undefined;
  const open = (target: string): void => {
    pending = window === undefined ? target : undefined;
    // A failed load is reported by the recovery monitor.
    window?.loadURL(target).catch(() => undefined);
  };
  app.on('second-instance', (_event, argv) => {
    if (window !== undefined) bringToFront(window);
    const target = chatLinkInArguments(argv, home);
    if (target !== undefined) open(target);
  });
  // macOS hands links to the running app instead of starting another one.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    const target = chatLinkTarget(url, home);
    if (target === undefined) warn('Ignored a link that is not a WhatsApp chat link.');
    else open(target);
  });
  return {
    attach: (attached) => {
      window = attached;
      if (pending !== undefined) open(pending);
    },
  };
}
