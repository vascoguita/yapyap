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

/**
 * Adds a hardened view filling `window`, kept in size as the window resizes;
 * `index` 0 puts it beneath every other view. Returns how to undo it.
 */
function fill(window: BrowserWindow, view: WebContentsView, index?: number): () => void {
  const fit = (): void => {
    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  window.contentView.addChildView(view, index);
  fit();
  window.on('resize', fit);
  return () => {
    window.off('resize', fit);
    window.contentView.removeChildView(view);
  };
}

/**
 * Lays a hardened view over the whole content of `window`, kept in size as
 * the window resizes, for screens such as recovery.
 */
export function createSecureOverlay(window: BrowserWindow, renderer: RendererOptions): Overlay {
  const view = new WebContentsView({ webPreferences: rendererPreferences(renderer) });
  const unfill = fill(window, view);
  return {
    webContents: view.webContents,
    remove: () => {
      unfill();
      view.webContents.close();
    },
  };
}

/**
 * The view an account's WhatsApp runs in, in its own partition (ADR 0001),
 * beneath any overlay such as recovery.
 */
export function createAccountView(window: BrowserWindow, renderer: RendererOptions): WebContents {
  const view = new WebContentsView({ webPreferences: rendererPreferences(renderer) });
  fill(window, view, 0);
  // A closed window leaves its views' pages running, firing events at a
  // window that no longer exists and holding up quitting (#223).
  window.once('closed', () => {
    view.webContents.close();
  });
  return view.webContents;
}
