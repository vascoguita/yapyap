import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureWebPreferences } from './web-preferences.ts';

const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly options: unknown;
    constructor(options: unknown) {
      this.options = options;
      constructed.push(options);
    }
  },
}));

const { createSecureWindow, rendererPreferences } = await import('./windows.ts');

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

describe('createSecureWindow', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it('creates the window with the hardened preferences', () => {
    createSecureWindow({ title: 'YapYap', show: false }, { preload: '/p.js' });
    expect(constructed).toStrictEqual([
      { title: 'YapYap', show: false, webPreferences: rendererPreferences({ preload: '/p.js' }) },
    ]);
  });

  it('ignores web preferences smuggled past the type system', () => {
    const smuggled = { webPreferences: { sandbox: false, nodeIntegration: true } };
    createSecureWindow(smuggled as unknown as { title: string });
    expect(constructed).toStrictEqual([{ webPreferences: secureWebPreferences() }]);
  });
});
