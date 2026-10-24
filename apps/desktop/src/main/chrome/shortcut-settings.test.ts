import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS, type ShortcutChange } from '../../shared/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { shortcutHandlers } from './shortcut-settings.ts';

function setup(readOnly = false, platform = 'linux') {
  let settings: Settings = defaultSettings();
  const service = {
    current: () => settings,
    readOnly,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
  };
  const handlers = shortcutHandlers(service, platform);
  const handler = (channel: string) => {
    const found = handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(channel);
    }
    return found;
  };
  const set = (id: string, accelerator: string | null) =>
    handler(CHROME_CHANNELS.shortcutsSet).handle({ sender: {} }, id, accelerator) as ShortcutChange;
  return { service, handler, set, settings: () => settings };
}

describe('shortcutHandlers', () => {
  it('saves new keys and lists them, then goes back to YapYap’s own', () => {
    const t = setup();
    const changed = t.set('settings', 'CmdOrCtrl+Shift+K');
    expect(changed.problem).toBe('');
    expect(t.settings().shortcuts.custom).toEqual({ settings: 'CmdOrCtrl+Shift+K' });
    expect(changed.shortcuts.find((shortcut) => shortcut.id === 'settings')).toMatchObject({
      accelerator: 'CmdOrCtrl+Shift+K',
      standard: 'CmdOrCtrl+,',
      custom: true,
    });
    t.set('zoomIn', 'Alt+=');
    expect(t.set('settings', null).problem).toBe('');
    expect(t.settings().shortcuts.custom).toEqual({ zoomIn: 'Alt+=' });
  });

  it('refuses keys that do not fit, or that another action uses', () => {
    const t = setup();
    expect(t.set('settings', 'K').problem).toMatch(/^Use a key together with a modifier/);
    expect(t.set('switchAccount', 'Alt+2').problem).toBe(
      'Switching accounts needs keys that end in 1, as it takes 1 to 9.',
    );
    expect(t.set('settings', 'Ctrl+Q').problem).toBe(
      'Those keys are already used for “Quit YapYap”.',
    );
    expect(t.set('zoomIn', 'CmdOrCtrl+5').problem).toBe(
      'Those keys are already used for “Switch to the first account; 2 to 9 switch to the next ones”.',
    );
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('saves nothing in a newer YapYap’s file', () => {
    const t = setup(true);
    expect(t.set('settings', 'CmdOrCtrl+Shift+K').problem).toBe('');
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('accepts only shortcuts this platform has, with keys or null', () => {
    const { accepts } = setup(false, 'win32').handler(CHROME_CHANNELS.shortcutsSet);
    expect(accepts(['settings', 'CmdOrCtrl+K'])).toBe(true);
    expect(accepts(['settings', null])).toBe(true);
    expect(accepts(['quit', 'CmdOrCtrl+K'])).toBe(false);
    expect(accepts(['nothing', 'CmdOrCtrl+K'])).toBe(false);
    expect(accepts(['settings', 7])).toBe(false);
    expect(accepts(['settings', 'K'.repeat(65)])).toBe(false);
    expect(accepts(['settings', 'CmdOrCtrl+K', 'extra'])).toBe(false);
  });
});
