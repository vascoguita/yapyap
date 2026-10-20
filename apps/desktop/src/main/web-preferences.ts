import type { WebPreferences } from 'electron';

/**
 * The only source of web preferences in YapYap. Every renderer, trusted or
 * not, starts from this hardened baseline (see ADR 0001).
 */
export function secureWebPreferences(): WebPreferences {
  return {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    spellcheck: false,
  };
}

/** The only settings a caller may add on top of the hardened baseline. */
export interface RendererOptions {
  readonly preload?: string;
  readonly partition?: string;
  readonly spellcheck?: boolean;
}

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
