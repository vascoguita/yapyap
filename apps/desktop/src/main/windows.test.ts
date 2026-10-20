import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rendererPreferences, secureWebPreferences } from './web-preferences.ts';

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

const { createSecureWindow } = await import('./windows.ts');

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
