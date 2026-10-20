import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { followThemeSetting, type ThemePort } from './theme.ts';

describe('followThemeSetting', () => {
  it('applies the theme at once and on every change', () => {
    const nativeTheme: ThemePort = { themeSource: 'light' };
    const listeners: ((settings: Settings) => void)[] = [];
    followThemeSetting(nativeTheme, {
      current: defaultSettings,
      onChange: (listener) => {
        listeners.push(listener);
      },
    });
    expect(nativeTheme.themeSource).toBe('system');
    const dark = defaultSettings();
    for (const listener of listeners)
      listener({ ...dark, appearance: { ...dark.appearance, theme: 'dark' } });
    expect(nativeTheme.themeSource).toBe('dark');
  });
});
