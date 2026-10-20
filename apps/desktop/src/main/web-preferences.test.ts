import { describe, expect, it } from 'vitest';
import { rendererPreferences, secureWebPreferences } from './web-preferences.ts';

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

describe('rendererPreferences', () => {
  it('is the hardened baseline when nothing is added', () => {
    expect(rendererPreferences()).toStrictEqual(secureWebPreferences());
  });

  it('adds only the preload, partition and spellcheck it is given', () => {
    expect(
      rendererPreferences({ preload: '/app/preload.js', partition: 'persist:a', spellcheck: true }),
    ).toStrictEqual({
      ...secureWebPreferences(),
      preload: '/app/preload.js',
      partition: 'persist:a',
      spellcheck: true,
    });
    expect(rendererPreferences({ partition: 'persist:b' })).toStrictEqual({
      ...secureWebPreferences(),
      partition: 'persist:b',
    });
  });
});
