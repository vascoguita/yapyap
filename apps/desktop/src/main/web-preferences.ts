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
