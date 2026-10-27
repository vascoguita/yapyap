import { chatLinkInArguments, chatLinkTarget } from './navigation/deep-link.ts';
import { pluginLinkInArguments, pluginLinkTarget } from './navigation/plugin-link.ts';

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
}

/** The WhatsApp that opens chat links. */
export interface LinkPage {
  loadURL(url: string): Promise<unknown>;
}

export interface Instances {
  /**
   * Hands chat links to WhatsApp and plugin install links to `install`,
   * including any that arrived before them, and brings the window to the
   * front for later launches.
   */
  readonly attach: (window: LinkWindow, page: LinkPage, install: (id: string) => void) => void;
}

/** Where each kind of link goes once YapYap can take it. */
interface LinkTargets {
  readonly window: () => LinkWindow | undefined;
  readonly open: (target: string) => void;
  readonly install: (id: string) => void;
}

export function bringToFront(window: LinkWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

/** A link handed to the running app: a chat link, a plugin install link, or neither. */
function follow(url: string, home: string, links: LinkTargets): boolean {
  const target = chatLinkTarget(url, home);
  const plugin = target === undefined ? pluginLinkTarget(url) : undefined;
  if (target !== undefined) {
    links.open(target);
  } else if (plugin !== undefined) {
    links.install(plugin);
  }
  return target !== undefined || plugin !== undefined;
}

/** Hands every later launch, and every macOS link event, to the links' targets. */
function listenForLaunches(
  app: InstanceApp,
  home: string,
  warn: (message: string) => void,
  links: LinkTargets,
): void {
  app.on('second-instance', (_event, argv) => {
    const window = links.window();
    if (window !== undefined) {
      bringToFront(window);
    }
    const target = chatLinkInArguments(argv, home);
    const plugin = pluginLinkInArguments(argv);
    if (target !== undefined) {
      links.open(target);
    }
    if (plugin !== undefined) {
      links.install(plugin);
    }
  });
  // macOS hands links to the running app instead of starting another one.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!follow(url, home, links)) {
      // The link itself is never logged: a chat link names a phone number.
      warn('Ignored a link that is neither a WhatsApp chat link nor a plugin install link.');
    }
  });
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
  let page: LinkPage | undefined;
  let installer: ((id: string) => void) | undefined;
  let pending: string | undefined;
  let pendingPlugin: string | undefined;
  const open = (target: string): void => {
    pending = page === undefined ? target : undefined;
    // A failed load is reported by the recovery monitor.
    page?.loadURL(target).catch(() => undefined);
  };
  const install = (id: string): void => {
    pendingPlugin = installer === undefined ? id : undefined;
    installer?.(id);
  };
  listenForLaunches(app, home, warn, { window: () => window, open, install });
  return {
    attach: (attachedWindow, attachedPage, attachedInstaller) => {
      window = attachedWindow;
      page = attachedPage;
      installer = attachedInstaller;
      if (pending !== undefined) {
        open(pending);
      }
      if (pendingPlugin !== undefined) {
        install(pendingPlugin);
      }
    },
  };
}
