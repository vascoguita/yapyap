/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi } from '../../shared/chrome-api.ts';
import { shortcutsFor } from '../../shared/shortcuts.ts';
import { Shortcuts } from './Shortcuts.tsx';

function api(platform: string) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), restart: vi.fn(), export: vi.fn(), import: vi.fn() },
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
    report: { diagnostics: vi.fn(), open: vi.fn() },
    shortcuts: {
      list: vi.fn(() => Promise.resolve({ platform, shortcuts: shortcutsFor(platform) })),
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
