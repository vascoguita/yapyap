/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { shortcutsFor } from '../../shared/shortcuts.ts';
import { Shortcuts } from './Shortcuts.tsx';

function api(platform: string) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      restart: vi.fn(),
      export: vi.fn(),
      import: vi.fn(),
      chooseFolder: vi.fn(),
    },
    chat: { openNumber: vi.fn() },
    accounts: {
      list: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      permissions: vi.fn(),
      forgetPermissions: vi.fn(),
    },
    sidebar: {
      state: vi.fn(),
      switchTo: vi.fn(),
      setCompact: vi.fn(),
      stopSharing: vi.fn(),
      onState: vi.fn(),
    },
    plugins: { list: vi.fn(), consent: vi.fn(), answer: vi.fn() },
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
    spelling: { languages: vi.fn(), choose: vi.fn() },
    downloads: { list: vi.fn(), act: vi.fn(), clear: vi.fn() },
    report: { diagnostics: vi.fn(), open: vi.fn() },
    proxyLogin: { request: vi.fn(), answer: vi.fn() },
    shortcuts: {
      list: vi.fn(() => Promise.resolve({ platform, shortcuts: shortcutsFor(platform) })),
      set: vi.fn((id: string, accelerator: string | null) =>
        Promise.resolve({
          platform,
          shortcuts: shortcutsFor(platform, accelerator === null ? {} : { [id]: accelerator }),
          problem:
            accelerator === 'CmdOrCtrl+Q' ? 'Those keys are already used for “Quit YapYap”.' : '',
        }),
      ),
    },
  } satisfies ChromeApi;
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
    expect(await screen.findAllByRole('row')).toHaveLength(shortcutsFor('linux').length + 1);
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
