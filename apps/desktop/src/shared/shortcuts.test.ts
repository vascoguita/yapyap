import { describe, expect, it } from 'vitest';
import { acceleratorOf, keysOf, SHORTCUTS, shortcutsFor } from './shortcuts.ts';

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
