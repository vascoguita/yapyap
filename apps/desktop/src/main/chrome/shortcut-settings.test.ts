import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS, type ShortcutChange } from '../../shared/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import type { ExtensionCommand } from '../extensions/runtime.ts';
import { shortcutHandlers } from './shortcut-settings.ts';

function setup(
  readOnly = false,
  platform = 'linux',
  registered = true,
  commands: readonly ExtensionCommand[] = [],
) {
  let settings: Settings = defaultSettings();
  const service = {
    current: () => settings,
    readOnly,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
  };
  const handlers = shortcutHandlers(
    service,
    platform,
    () => registered,
    () => commands,
  );
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
    expect(accepts(['settings', 'K'.repeat(64)])).toBe(true);
    expect(accepts(['settings', ['CmdOrCtrl+K']])).toBe(false);
    expect(accepts(['toggleWindow', 'F9'])).toBe(true);
    expect(accepts(['settings', 'CmdOrCtrl+K', 'extra'])).toBe(false);
  });
});

describe('the shortcut that works from any app', () => {
  it('has no keys at first, takes some, and gives them back', () => {
    const t = setup();
    const before = t
      .handler(CHROME_CHANNELS.shortcutsList)
      .handle({ sender: {} }) as ShortcutChange;
    expect(before.global).toEqual([
      {
        id: 'toggleWindow',
        label: 'Show or hide YapYap, from any app',
        accelerator: '',
        registered: true,
      },
    ]);
    expect(t.set('toggleWindow', 'CmdOrCtrl+Alt+Y').problem).toBe('');
    expect(t.settings().shortcuts.global.toggleWindow).toBe('CmdOrCtrl+Alt+Y');
    expect(t.set('toggleWindow', null).problem).toBe('');
    expect(t.settings().shortcuts.global.toggleWindow).toBe('');
  });

  it('takes no keys that do not fit or that YapYap already uses, either way round', () => {
    const t = setup();
    expect(t.set('toggleWindow', 'Y').problem).toMatch(/^Use a key together/);
    expect(t.set('toggleWindow', 'Ctrl+,').problem).toBe(
      'Those keys are already used for “Open Settings”.',
    );
    t.set('toggleWindow', 'CmdOrCtrl+Alt+Y');
    expect(t.set('settings', 'Ctrl+Alt+Y').problem).toBe(
      'Those keys are already used for “Show or hide YapYap, from any app”.',
    );
  });

  it('says when the system did not grant the keys, and never for no keys', () => {
    const t = setup(false, 'linux', false);
    const list = t.handler(CHROME_CHANNELS.shortcutsList).handle({ sender: {} }) as ShortcutChange;
    expect(list.global[0]?.registered).toBe(true);
    expect(t.set('toggleWindow', 'F9').global[0]?.registered).toBe(false);
  });
});

describe('an extension command’s keys', () => {
  const RECORD = {
    extension: 'org.example.rec',
    extensionName: 'Rec',
    id: 'record',
    title: 'Record this call',
    shortcut: 'CmdOrCtrl+Alt+R',
  };
  const STOP = { ...RECORD, id: 'stop', title: 'Stop', shortcut: 'CmdOrCtrl+Alt+S' };

  it('lists each running command with the keys it has and suggests', () => {
    const t = setup(false, 'linux', true, [RECORD, { ...STOP, shortcut: undefined }]);
    const listed = t
      .handler(CHROME_CHANNELS.shortcutsList)
      .handle({ sender: {} }) as ShortcutChange;
    expect(listed.extensions).toEqual([
      {
        id: 'org.example.rec/record',
        label: 'Rec: Record this call',
        accelerator: 'CmdOrCtrl+Alt+R',
        suggested: 'CmdOrCtrl+Alt+R',
        custom: false,
      },
      {
        id: 'org.example.rec/stop',
        label: 'Rec: Stop',
        accelerator: '',
        suggested: '',
        custom: false,
      },
    ]);
    expect(setup().handler(CHROME_CHANNELS.shortcutsList).handle({ sender: {} })).toMatchObject({
      extensions: [],
    });
  });

  it('takes other keys, removes them, and goes back to the suggestion', () => {
    const t = setup(false, 'linux', true, [RECORD, STOP]);
    expect(t.set('org.example.rec/record', 'CmdOrCtrl+Alt+Q').problem).toBe('');
    expect(t.settings().shortcuts.extensions).toEqual({
      'org.example.rec/record': 'CmdOrCtrl+Alt+Q',
    });
    const removed = t.set('org.example.rec/record', '');
    expect(removed.problem).toBe('');
    expect(removed.extensions[0]).toMatchObject({ accelerator: '', custom: true });
    t.set('org.example.rec/record', null);
    expect(t.settings().shortcuts.extensions).toEqual({});
  });

  it('refuses keys that do not fit, or that YapYap or another command uses', () => {
    const t = setup(false, 'linux', true, [RECORD, STOP]);
    expect(t.set('org.example.rec/record', 'Q').problem).toBe(
      'Use a key together with a modifier such as Ctrl, Alt, Shift or ⌘, or a function key alone.',
    );
    expect(t.set('org.example.rec/record', 'CmdOrCtrl+R').problem).toMatch(/already used/);
    expect(t.set('org.example.rec/record', 'CmdOrCtrl+Alt+S').problem).toBe(
      'Those keys are already used for “Rec: Stop”.',
    );
    expect(t.settings().shortcuts.extensions).toEqual({});
  });

  it('accepts only commands that are running', () => {
    const t = setup(false, 'linux', true, [RECORD]);
    const accepts = t.handler(CHROME_CHANNELS.shortcutsSet).accepts;
    expect(accepts(['org.example.rec/record', ''])).toBe(true);
    expect(accepts(['org.example.rec/gone', 'CmdOrCtrl+Alt+G'])).toBe(false);
  });
});
