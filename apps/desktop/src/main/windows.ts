import { BrowserWindow, type BrowserWindowConstructorOptions, type WebPreferences } from 'electron';
import { secureWebPreferences } from './web-preferences.ts';

/** The only settings a caller may add on top of the hardened baseline. */
export interface RendererOptions {
  readonly preload?: string;
  readonly partition?: string;
  readonly spellcheck?: boolean;
}

export type WindowOptions = Omit<BrowserWindowConstructorOptions, 'webPreferences'>;

export function rendererPreferences({
  preload,
  partition,
  spellcheck,
}: RendererOptions = {}): WebPreferences {
  return {
    ...secureWebPreferences(),
    ...(preload === undefined ? {} : { preload }),
    ...(partition === undefined ? {} : { partition }),
    ...(spellcheck === undefined ? {} : { spellcheck }),
  };
}

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
