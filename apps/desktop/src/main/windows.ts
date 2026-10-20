import { BrowserWindow, WebContentsView, type BrowserWindowConstructorOptions } from 'electron';
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
 * Lays a hardened view over the whole content of `window`, kept in size as
 * the window resizes, for screens such as recovery.
 */
export function createSecureOverlay(window: BrowserWindow, renderer: RendererOptions): Overlay {
  const view = new WebContentsView({ webPreferences: rendererPreferences(renderer) });
  const fit = (): void => {
    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  window.contentView.addChildView(view);
  fit();
  window.on('resize', fit);
  return {
    webContents: view.webContents,
    remove: () => {
      window.off('resize', fit);
      window.contentView.removeChildView(view);
      view.webContents.close();
    },
  };
}
