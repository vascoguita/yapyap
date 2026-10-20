import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
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
