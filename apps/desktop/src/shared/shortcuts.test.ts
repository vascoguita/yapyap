import { describe, expect, it } from 'vitest';
import {
  acceleratorOf,
  extensionShortcuts,
  fitsShortcut,
  keysOf,
  SHORTCUTS,
  shortcutsFor,
} from './shortcuts.ts';

describe('shortcutsFor', () => {
  it('gives each platform its own shortcuts and keys', () => {
    const ids = (platform: string) => shortcutsFor(platform).map((shortcut) => shortcut.id);
    expect(ids('linux')).toContain('quit');
    expect(ids('linux')).not.toContain('hide');
    expect(ids('win32')).not.toContain('quit');
    expect(ids('darwin')).toEqual(expect.arrayContaining(['hide', 'quit']));
    expect(acceleratorOf('redo', 'linux')).toBe('CmdOrCtrl+Y');
    expect(acceleratorOf('redo', 'darwin')).toBe('Shift+Cmd+Z');
    expect(acceleratorOf('quit', 'win32')).toBeUndefined();
  });

  it('never gives two actions the same keys on one platform', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      const keys = shortcutsFor(platform).map((shortcut) => shortcut.accelerator);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.id)).size).toBe(SHORTCUTS.length);
  });
});

describe('keysOf', () => {
  it('writes keys as each platform does', () => {
    expect(keysOf('CmdOrCtrl+Shift+H', 'linux')).toEqual(['Ctrl', 'Shift', 'H']);
    expect(keysOf('CmdOrCtrl+Shift+H', 'darwin')).toEqual(['⇧', '⌘', 'H']);
    expect(keysOf('Alt+Shift+Cmd+V', 'darwin')).toEqual(['⌥', '⇧', '⌘', 'V']);
    expect(keysOf('Ctrl+Cmd+F', 'darwin')).toEqual(['⌃', '⌘', 'F']);
    expect(keysOf('F11', 'win32')).toEqual(['F11']);
  });
});

describe('custom shortcuts', () => {
  it('uses keys the user chose, and YapYap’s own where theirs do not fit', () => {
    const custom = { settings: 'Alt+S', zoomIn: 'nonsense', switchAccount: 'Alt+2' };
    const settings = shortcutsFor('linux', custom).find((shortcut) => shortcut.id === 'settings');
    expect(settings).toMatchObject({ accelerator: 'Alt+S', standard: 'CmdOrCtrl+,', custom: true });
    expect(acceleratorOf('zoomIn', 'linux', custom)).toBe('CmdOrCtrl+=');
    expect(acceleratorOf('switchAccount', 'linux', custom)).toBe('CmdOrCtrl+1');
    expect(acceleratorOf('switchAccount', 'linux', { switchAccount: 'Alt+1' })).toBe('Alt+1');
  });

  it('lets account switching end only in 1', () => {
    expect(fitsShortcut('switchAccount', 'Alt+1')).toBe(true);
    expect(fitsShortcut('switchAccount', 'Alt+2')).toBe(false);
    expect(fitsShortcut('settings', 'Alt+2')).toBe(true);
    expect(fitsShortcut('settings', '2')).toBe(false);
  });
});

describe('extensionShortcuts', () => {
  const command = (extension: string, id: string, shortcut?: string) => ({
    extension,
    id,
    shortcut,
  });

  it('gives an extension command the keys it suggests, when nothing else has them', () => {
    const given = extensionShortcuts(
      [
        command('org.example.rec', 'record', 'CmdOrCtrl+Shift+E'),
        command('org.example.rec', 'stop'),
        command('org.example.rec', 'odd', 'Hello'),
      ],
      'linux',
    );
    expect([...given]).toEqual([['org.example.rec/record', 'CmdOrCtrl+Shift+E']]);
  });

  it('never takes YapYap’s keys, as the user set them, nor an earlier extension’s', () => {
    const given = extensionShortcuts(
      [
        command('org.example.a', 'reload', 'Ctrl+R'),
        command('org.example.a', 'mine', 'CmdOrCtrl+Shift+E'),
        command('org.example.b', 'same', 'Ctrl+Shift+E'),
        command('org.example.b', 'freed', 'CmdOrCtrl+J'),
      ],
      'linux',
      { downloads: 'CmdOrCtrl+Shift+D' },
    );
    expect([...given]).toEqual([
      ['org.example.a/mine', 'CmdOrCtrl+Shift+E'],
      ['org.example.b/freed', 'CmdOrCtrl+J'],
    ]);
    // On macOS, CmdOrCtrl is ⌘, so Ctrl+R is free there.
    expect(extensionShortcuts([command('org.example.a', 'reload', 'Ctrl+R')], 'darwin').size).toBe(
      1,
    );
  });

  it('puts the user’s choice first: other keys, or none, over the suggestion', () => {
    const given = extensionShortcuts(
      [
        command('org.example.a', 'one', 'CmdOrCtrl+Alt+Q'),
        command('org.example.b', 'two', 'CmdOrCtrl+Alt+W'),
        command('org.example.b', 'three', 'CmdOrCtrl+Alt+E'),
      ],
      'linux',
      {},
      { 'org.example.b/two': 'CmdOrCtrl+Alt+Q', 'org.example.b/three': '' },
    );
    // b/two took the keys a/one suggested, so a/one has none; b/three's were removed.
    expect([...given]).toEqual([['org.example.b/two', 'CmdOrCtrl+Alt+Q']]);
  });
});
