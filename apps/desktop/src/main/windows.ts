import {
  BrowserWindow,
  WebContentsView,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from 'electron';
import type { Overlay } from './recovery/controller.ts';
import { rendererPreferences, type RendererOptions } from './web-preferences.ts';

export type WindowOptions = Omit<BrowserWindowConstructorOptions, 'webPreferences'>;

/**
 * The only place YapYap creates windows; lint forbids it anywhere else.
 * Preferences are applied last, so options smuggled past the type system
 * cannot weaken the sandbox.
 */
export function createSecureWindow(
  options: WindowOptions,
  renderer?: RendererOptions,
): BrowserWindow {
  return new BrowserWindow({ ...options, webPreferences: rendererPreferences(renderer) });
}

/** The strip the sidebar takes on the window's left edge, which every other view leaves free. */
interface Layout {
  left: number;
  readonly refits: Set<() => void>;
}

const layouts = new WeakMap<BrowserWindow, Layout>();

function layoutOf(window: BrowserWindow): Layout {
  const existing = layouts.get(window);
  if (existing !== undefined) {
    return existing;
  }
  const layout: Layout = { left: 0, refits: new Set() };
  layouts.set(window, layout);
  return layout;
}

/**
 * Adds `view` on top of the others, filling `window` beside the sidebar and
 * kept in size as the window resizes. Returns how to take it away again.
 */
function fill(window: BrowserWindow, view: WebContentsView): () => void {
  const layout = layoutOf(window);
  const fit = (): void => {
    const [width = 0, height = 0] = window.getContentSize();
    const left = Math.min(layout.left, width);
    view.setBounds({ x: left, y: 0, width: width - left, height });
  };
  window.contentView.addChildView(view);
  fit();
  window.on('resize', fit);
  layout.refits.add(fit);
  return () => {
    window.off('resize', fit);
    layout.refits.delete(fit);
    window.contentView.removeChildView(view);
  };
}

/** The account sidebar: a chrome page docked on the main window's left edge. */
export interface SidebarView {
  readonly webContents: WebContents;
  /** Zero takes the sidebar away and gives the accounts the whole window. */
  readonly setWidth: (width: number) => void;
}

export function createSidebarView(window: BrowserWindow, renderer: RendererOptions): SidebarView {
  const view = new WebContentsView({ webPreferences: rendererPreferences(renderer) });
  const layout = layoutOf(window);
  let docked = false;
  const fit = (): void => {
    const [, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width: layout.left, height });
  };
  window.on('resize', fit);
  // As with account views, a closed window would leave the page running (#223).
  window.once('closed', () => {
    view.webContents.close();
  });
  return {
    webContents: view.webContents,
    setWidth: (width) => {
      layout.left = width;
      if (docked !== width > 0) {
        docked = width > 0;
        if (docked) {
          window.contentView.addChildView(view);
        } else {
          window.contentView.removeChildView(view);
        }
      }
      fit();
      for (const refit of layout.refits) {
        refit();
      }
    },
  };
}

/**
 * One account in the main window: its WhatsApp, in its own partition
 * (ADR 0001), and any screen laid over it, such as recovery. They are shown
 * and hidden together, so switching accounts never shows one account's
 * recovery screen over another, and a hidden account's page counts as
 * hidden.
 */
export interface AccountHost {
  readonly webContents: WebContents;
  readonly show: () => void;
  readonly hide: () => void;
  readonly createOverlay: (renderer: RendererOptions) => Overlay;
  /** Removes the account's views for good, closing their pages. */
  readonly close: () => void;
}

/** Closes the pages of `views` the first time it is called, whoever calls it first. */
function closeOnce(views: () => readonly WebContentsView[]): () => void {
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      for (const view of views()) {
        view.webContents.close();
      }
    }
  };
}

/** An overlay that takes itself out of its account, then closes its page. */
function overlayOf(view: WebContentsView, takeOut: () => void): Overlay {
  return {
    webContents: view.webContents,
    remove: () => {
      takeOut();
      view.webContents.close();
    },
  };
}

export function createAccountHost(window: BrowserWindow, renderer: RendererOptions): AccountHost {
  const page = new WebContentsView({ webPreferences: rendererPreferences(renderer) });
  const overlays = new Set<WebContentsView>();
  const shown = new Map<WebContentsView, () => void>();
  const hide = (): void => {
    for (const undo of shown.values()) {
      undo();
    }
    shown.clear();
  };
  const closePages = closeOnce(() => [page, ...overlays]);
  // A closed window leaves its views' pages running, firing events at a
  // window that no longer exists and holding up quitting (#223).
  window.once('closed', closePages);
  return {
    hide,
    webContents: page.webContents,
    show: () => {
      for (const view of shown.has(page) ? [] : [page, ...overlays]) {
        shown.set(view, fill(window, view));
      }
    },
    createOverlay: (overlayRenderer) => {
      const view = new WebContentsView({ webPreferences: rendererPreferences(overlayRenderer) });
      overlays.add(view);
      if (shown.has(page)) {
        shown.set(view, fill(window, view));
      }
      return overlayOf(view, () => {
        overlays.delete(view);
        shown.get(view)?.();
        shown.delete(view);
      });
    },
    close: () => {
      hide();
      closePages();
    },
  };
}
