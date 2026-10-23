import { describe, expect, it } from 'vitest';
import { trayIconChoice } from './icon-choice.ts';

describe('trayIconChoice', () => {
  it('keeps the app icon when asked to', () => {
    expect(trayIconChoice('color', 'darwin', true)).toBe('color');
    expect(trayIconChoice('color', 'linux', false)).toBe('color');
  });

  it('uses a template image for any symbolic icon on macOS', () => {
    expect(trayIconChoice('auto', 'darwin', false)).toBe('template');
    expect(trayIconChoice('dark', 'darwin', true)).toBe('template');
  });

  it('follows the panel in auto, and keeps a chosen shade', () => {
    expect(trayIconChoice('auto', 'linux', true)).toBe('light');
    expect(trayIconChoice('auto', 'win32', false)).toBe('dark');
    expect(trayIconChoice('light', 'linux', false)).toBe('light');
    expect(trayIconChoice('dark', 'win32', true)).toBe('dark');
  });
});
