/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ExtensionShortcutState } from '../../shared/chrome-api.ts';
import { shortcutsFor } from '../../shared/shortcuts.ts';
import { Shortcuts } from './Shortcuts.tsx';

const NO_EXTENSIONS: readonly ExtensionShortcutState[] = [];

const globalOf = (accelerator: string, registered = true) => [
  { id: 'toggleWindow', label: 'Show or hide YapYap, from any app', accelerator, registered },
];

function api(platform: string) {
  return fakeChromeApi({
    shortcuts: {
      list: vi.fn(() =>
        Promise.resolve({
          platform,
          shortcuts: shortcutsFor(platform),
          global: globalOf(''),
          extensions: NO_EXTENSIONS,
        }),
      ),
      set: vi.fn((id: string, accelerator: string | null) =>
        Promise.resolve({
          platform,
          shortcuts: shortcutsFor(
            platform,
            accelerator === null || id === 'toggleWindow' ? {} : { [id]: accelerator },
          ),
          global: globalOf(id === 'toggleWindow' ? (accelerator ?? '') : '', accelerator !== 'F9'),
          extensions: NO_EXTENSIONS,
          problem:
            accelerator === 'CmdOrCtrl+Q' ? 'Those keys are already used for “Quit YapYap”.' : '',
        }),
      ),
    },
  });
}

const row = (action: string) => {
  const cell = screen.getByRole('cell', { name: action });
  const found = cell.closest('tr');
  if (found === null) {
    throw new Error(`No row for ${action}.`);
  }
  return within(found);
};

describe('Shortcuts', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists every shortcut with its keys, joined with plus signs', async () => {
    render(<Shortcuts api={api('linux')} />);
    expect(await screen.findAllByRole('row')).toHaveLength(shortcutsFor('linux').length + 2);
    expect(
      row('Turn the privacy screen on or off')
        .getAllByText(/./, { selector: 'kbd' })
        .map((key) => key.textContent),
    ).toEqual(['Ctrl', 'Shift', 'H']);
    expect(
      row('Turn the privacy screen on or off').getByRole('cell', { name: /Ctrl/ }).textContent,
    ).toBe('Ctrl+Shift+H');
  });

  it('writes keys as macOS does', async () => {
    render(<Shortcuts api={api('darwin')} />);
    expect(
      (await screen.findByRole('cell', { name: 'Hide YapYap' })).nextElementSibling?.textContent,
    ).toBe('⌘H');
  });
});

describe('changing a shortcut', () => {
  afterEach(() => {
    cleanup();
  });

  const press = (code: string, keys: KeyboardEventInit = {}) => {
    fireEvent.keyDown(window, { code, ...keys });
  };

  it('takes the next keys pressed, and shows them', async () => {
    const yapyap = api('linux');
    render(<Shortcuts api={yapyap} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change: Open Settings' }));
    expect(screen.getByRole('status').textContent).toBe(
      'Press the new keys, or Escape to keep these',
    );
    press('ControlLeft', { ctrlKey: true });
    expect(yapyap.shortcuts.set).not.toHaveBeenCalled();
    press('KeyK', { ctrlKey: true, shiftKey: true });
    expect(yapyap.shortcuts.set).toHaveBeenCalledExactlyOnceWith('settings', 'CmdOrCtrl+Shift+K');
    expect(await screen.findByRole('button', { name: 'Reset: Open Settings' })).toBeTruthy();
    expect(row('Open Settings').getByRole('cell', { name: /Ctrl/ }).textContent).toBe(
      'Ctrl+Shift+K',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset: Open Settings' }));
    expect(yapyap.shortcuts.set).toHaveBeenLastCalledWith('settings', null);
  });

  it('says why keys were refused', async () => {
    render(<Shortcuts api={api('linux')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change: Zoom in' }));
    press('KeyQ', { ctrlKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Those keys are already used for “Quit YapYap”.',
    );
  });

  it('keeps the keys, and the window, on Escape', async () => {
    const yapyap = api('linux');
    const closed = vi.fn();
    document.addEventListener('keydown', closed);
    render(<Shortcuts api={yapyap} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change: Zoom in' }));
    press('Escape');
    expect(closed).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(yapyap.shortcuts.set).not.toHaveBeenCalled();
    press('KeyK', { ctrlKey: true });
    expect(yapyap.shortcuts.set).not.toHaveBeenCalled();
    document.removeEventListener('keydown', closed);
  });
});

describe('a shortcut that works from any app', () => {
  afterEach(() => {
    cleanup();
  });

  it('has no keys at first, takes some, says when the system refused them, and gives them back', async () => {
    const yapyap = api('linux');
    render(<Shortcuts api={yapyap} />);
    expect(await screen.findByText('None')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Remove: Show or hide YapYap, from any app' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change: Show or hide YapYap, from any app' }),
    );
    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true, altKey: true });
    expect(yapyap.shortcuts.set).toHaveBeenCalledExactlyOnceWith('toggleWindow', 'CmdOrCtrl+Alt+Y');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove: Show or hide YapYap, from any app' }),
    );
    expect(yapyap.shortcuts.set).toHaveBeenLastCalledWith('toggleWindow', null);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Change: Show or hide YapYap, from any app' }),
    );
    fireEvent.keyDown(window, { code: 'F9' });
    expect(await screen.findByText(/Another app already uses those keys/)).toBeTruthy();
  });
});

describe('an extension command’s keys', () => {
  afterEach(() => {
    cleanup();
  });

  const state = (accelerator: string, custom: boolean) => ({
    id: 'org.example.rec/record',
    label: 'Rec: Record this call',
    accelerator,
    suggested: 'CmdOrCtrl+Alt+R',
    custom,
  });

  it('shows the keys an extension suggests, removes them, takes others, and resets', async () => {
    const yapyap = api('linux');
    const listed = (accelerator: string, custom: boolean) => ({
      platform: 'linux',
      shortcuts: shortcutsFor('linux'),
      global: globalOf(''),
      extensions: [state(accelerator, custom)],
    });
    yapyap.shortcuts.list.mockResolvedValue(listed('CmdOrCtrl+Alt+R', false));
    yapyap.shortcuts.set.mockImplementation((_id: string, accelerator: string | null) =>
      Promise.resolve({
        ...listed(accelerator ?? 'CmdOrCtrl+Alt+R', accelerator !== null),
        problem: '',
      }),
    );
    render(<Shortcuts api={yapyap} />);
    expect(await screen.findByText('Extension commands')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset: Rec: Record this call' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove: Rec: Record this call' }));
    expect(yapyap.shortcuts.set).toHaveBeenLastCalledWith('org.example.rec/record', '');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset: Rec: Record this call' }));
    expect(yapyap.shortcuts.set).toHaveBeenLastCalledWith('org.example.rec/record', null);
    fireEvent.click(await screen.findByRole('button', { name: 'Change: Rec: Record this call' }));
    fireEvent.keyDown(window, { code: 'KeyQ', ctrlKey: true, altKey: true });
    expect(yapyap.shortcuts.set).toHaveBeenLastCalledWith(
      'org.example.rec/record',
      'CmdOrCtrl+Alt+Q',
    );
  });

  it('shows no section without extension commands, and None for a command without keys', async () => {
    const yapyap = api('linux');
    render(<Shortcuts api={yapyap} />);
    expect(await screen.findByText('Keyboard shortcuts')).toBeTruthy();
    expect(screen.queryByText('Extension commands')).toBeNull();
    cleanup();
    yapyap.shortcuts.list.mockResolvedValue({
      platform: 'linux',
      shortcuts: shortcutsFor('linux'),
      global: globalOf('CmdOrCtrl+Alt+Y'),
      extensions: [state('', false)],
    });
    render(<Shortcuts api={yapyap} />);
    expect(await screen.findByText('None')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove: Rec: Record this call' })).toBeNull();
  });
});
