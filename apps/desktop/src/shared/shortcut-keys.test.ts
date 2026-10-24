import { describe, expect, it } from 'vitest';
import { acceleratorFromKeys, conflictOf, isValidShortcut } from './shortcut-keys.ts';

const press = (
  code: string,
  keys: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...keys,
});

describe('isValidShortcut', () => {
  it('takes one key with known modifiers, or a function key alone', () => {
    for (const valid of [
      'CmdOrCtrl+K',
      'Ctrl+Alt+Shift+9',
      'F5',
      'Super+Space',
      'Alt+Shift+/',
      'CmdOrCtrl+-',
    ]) {
      expect(isValidShortcut(valid), valid).toBe(true);
    }
    for (const invalid of [
      'K',
      'Space',
      '',
      'CmdOrCtrl+',
      'Hyper+K',
      'Ctrl+Ctrl+K',
      'Ctrl+KK',
      'Ctrl+F25',
      'Ctrl+Escape',
    ]) {
      expect(isValidShortcut(invalid), invalid).toBe(false);
    }
  });
});

describe('conflictOf', () => {
  const others = [
    { id: 'settings', accelerator: 'CmdOrCtrl+,' },
    { id: 'switchAccount', accelerator: 'CmdOrCtrl+1' },
    { id: 'quit', accelerator: 'Ctrl+Q' },
  ];

  it('finds the action that already uses the keys, as the platform presses them', () => {
    expect(conflictOf('zoomIn', 'Ctrl+,', others, 'linux')).toBe('settings');
    expect(conflictOf('zoomIn', 'Ctrl+,', others, 'darwin')).toBeUndefined();
    expect(conflictOf('zoomIn', 'CmdOrCtrl+Q', others, 'win32')).toBe('quit');
    expect(conflictOf('zoomIn', 'Shift+Ctrl+Q', others, 'linux')).toBeUndefined();
    expect(conflictOf('settings', 'CmdOrCtrl+,', others, 'linux')).toBeUndefined();
  });

  it('counts every digit account switching takes', () => {
    expect(conflictOf('zoomIn', 'CmdOrCtrl+7', others, 'linux')).toBe('switchAccount');
    expect(
      conflictOf(
        'switchAccount',
        'Alt+1',
        [...others, { id: 'reload', accelerator: 'Alt+5' }],
        'linux',
      ),
    ).toBe('reload');
  });

  it('ignores a binding it cannot read', () => {
    expect(
      conflictOf('zoomIn', 'Ctrl+K', [{ id: 'odd', accelerator: 'Hyper+K' }], 'linux'),
    ).toBeUndefined();
  });
});

describe('acceleratorFromKeys', () => {
  it('writes a key press as Electron does, with the platform’s main modifier', () => {
    expect(acceleratorFromKeys(press('KeyK', { ctrlKey: true, shiftKey: true }), 'linux')).toBe(
      'CmdOrCtrl+Shift+K',
    );
    expect(acceleratorFromKeys(press('KeyK', { metaKey: true, ctrlKey: true }), 'darwin')).toBe(
      'CmdOrCtrl+Ctrl+K',
    );
    expect(acceleratorFromKeys(press('Digit3', { altKey: true }), 'win32')).toBe('Alt+3');
    expect(acceleratorFromKeys(press('Slash', { metaKey: true }), 'linux')).toBe('Super+/');
    expect(acceleratorFromKeys(press('F7'), 'linux')).toBe('F7');
    expect(acceleratorFromKeys(press('ArrowUp', { ctrlKey: true }), 'linux')).toBe('CmdOrCtrl+Up');
  });

  it('waits for a key while only modifiers are down, and ignores keys it cannot bind', () => {
    expect(acceleratorFromKeys(press('ShiftLeft', { shiftKey: true }), 'linux')).toBeUndefined();
    expect(acceleratorFromKeys(press('NumpadEnter', { ctrlKey: true }), 'linux')).toBeUndefined();
  });
});
