import { describe, expect, it } from 'vitest';
import { secureWebPreferences } from './web-preferences.ts';

describe('secureWebPreferences', () => {
  it('returns the hardened baseline from ADR 0001', () => {
    expect(secureWebPreferences()).toStrictEqual({
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
    });
  });

  it('returns a fresh object so callers cannot weaken a shared baseline', () => {
    expect(secureWebPreferences()).not.toBe(secureWebPreferences());
  });
});
