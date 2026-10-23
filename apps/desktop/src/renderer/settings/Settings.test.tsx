/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeApi, SettingsSnapshot } from '../../shared/chrome-api.ts';
import type { SettingValue } from '../../shared/settings-fields.ts';
import { closeOnEscape, Field, Settings } from './Settings.tsx';

const HARDWARE = 'reliability.hardwareAcceleration';
const THEME = 'appearance.theme';

const snapshot = (overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot => ({
  values: { [THEME]: 'system', [HARDWARE]: true },
  restartPending: false,
  readOnly: false,
  problems: {},
  ...overrides,
});

function api(overrides: Partial<ChromeApi['settings']> = {}) {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: {
      get: vi.fn(() => Promise.resolve(snapshot())),
      set: vi.fn((id: string, value: SettingValue) =>
        Promise.resolve(
          snapshot({
            values: { ...snapshot().values, [id]: value },
            restartPending: id === HARDWARE && value === false,
          }),
        ),
      ),
      restart: vi.fn(() => Promise.resolve()),
      export: vi.fn(() =>
        Promise.resolve({ outcome: 'done' as const, message: 'Settings exported.' }),
      ),
      import: vi.fn(() =>
        Promise.resolve({ outcome: 'done' as const, message: 'Settings imported.' }),
      ),
      ...overrides,
    },
    chat: { openNumber: vi.fn() },
    accounts: { list: vi.fn(), save: vi.fn(), remove: vi.fn() },
    sidebar: {
      state: vi.fn(),
      switchTo: vi.fn(),
      setCompact: vi.fn(),
      stopSharing: vi.fn(),
      onState: vi.fn(),
    },
    plugins: { list: vi.fn(), consent: vi.fn(), answer: vi.fn() },
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
  } satisfies ChromeApi;
}

const toggle = () =>
  screen.findByRole<HTMLInputElement>('checkbox', { name: 'Use hardware acceleration' });

describe('Settings', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists the settings by section, each explained', async () => {
    render(<Settings api={api()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const box = await toggle();
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(screen.getByRole('region', { name: 'Reliability' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'General' })).toBeNull();
    expect(box.getAttribute('aria-describedby')).toBe(`${HARDWARE}-hint`);
    expect(document.getElementById(`${HARDWARE}-hint`)?.textContent).toMatch(
      /flickers or stays blank\. Takes effect after a restart\.$/,
    );
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull();
  });

  it('saves a change and offers a restart when it needs one', async () => {
    const t = api();
    render(<Settings api={t} />);
    fireEvent.click(await toggle());
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(HARDWARE, false);
    const restart = await screen.findByRole('button', { name: 'Restart now' });
    expect(screen.getByText('Restart YapYap to apply your changes.')).toBeTruthy();
    expect((await toggle()).checked).toBe(false);
    fireEvent.click(restart);
    expect(t.settings.restart).toHaveBeenCalledOnce();
  });

  it('says when a change could not be saved, until one is', async () => {
    const set = vi
      .fn<ChromeApi['settings']['set']>()
      .mockRejectedValueOnce(new Error('rejected'))
      .mockResolvedValueOnce(snapshot({ restartPending: true }));
    render(<Settings api={api({ set })} />);
    fireEvent.click(await toggle());
    expect(await screen.findByText('Could not save that setting.')).toBeTruthy();
    fireEvent.click(await toggle());
    await screen.findByRole('button', { name: 'Restart now' });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('locks the settings when a newer YapYap owns them', async () => {
    render(<Settings api={api({ get: () => Promise.resolve(snapshot({ readOnly: true })) })} />);
    expect((await toggle()).disabled).toBe(true);
    expect(screen.getByText(/saved by a newer version of YapYap/)).toBeTruthy();
  });

  it('shows unchecked switches for settings that are off', async () => {
    const off = snapshot({ values: { [THEME]: 'dark', [HARDWARE]: false } });
    render(<Settings api={api({ get: () => Promise.resolve(off) })} />);
    expect((await toggle()).checked).toBe(false);
    expect(screen.queryByText(/newer version/)).toBeNull();
  });

  it('says when the settings cannot be loaded', async () => {
    render(<Settings api={api({ get: () => Promise.reject(new Error('rejected')) })} />);
    expect(await screen.findByText('Settings are unavailable.')).toBeTruthy();
  });

  it('offers the theme as a group of choices that applies without a restart', async () => {
    const t = api();
    render(<Settings api={t} />);
    const group = await screen.findByRole('group', { name: 'Theme' });
    expect(group.getAttribute('aria-describedby')).toBe(`${THEME}-hint`);
    expect(document.getElementById(`${THEME}-hint`)?.textContent).toMatch(/System default\.$/);
    const system = screen.getByRole<HTMLInputElement>('radio', { name: 'Same as the system' });
    expect(system.checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(THEME, 'dark');
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(true);
    });
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull();
  });

  it('locks the choices too when a newer YapYap owns the settings', async () => {
    render(<Settings api={api({ get: () => Promise.resolve(snapshot({ readOnly: true })) })} />);
    const group = await screen.findByRole<HTMLFieldSetElement>('group', { name: 'Theme' });
    expect(group.disabled).toBe(true);
  });

  it('adds no restart hint to a setting that applies at once', () => {
    const field = {
      id: 'general.example',
      label: 'Example',
      description: 'Applies at once.',
      restart: false,
    } as const;
    render(<Field field={field} snapshot={snapshot()} onChange={vi.fn()} />);
    expect(document.getElementById('general.example-hint')?.textContent).toBe('Applies at once.');
  });

  it('explains under a setting why its change did not take effect', () => {
    const field = {
      id: 'general.example',
      label: 'Example',
      description: 'Does something.',
      restart: false,
    } as const;
    render(
      <Field
        field={field}
        snapshot={snapshot({ problems: { 'general.example': 'The system refused.' } })}
        onChange={vi.fn()}
      />,
    );
    expect(document.getElementById('general.example-hint')?.textContent).toBe(
      'Does something.The system refused.',
    );
  });

  it('exports the settings and says how it went', async () => {
    const t = api();
    render(<Settings api={t} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export settings…' }));
    expect(await screen.findByText('Settings exported.')).toBeTruthy();
    expect(t.settings.export).toHaveBeenCalledOnce();
    expect(t.settings.get).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Backup' }).textContent).toContain(
      'never includes your WhatsApp login or chats',
    );
  });

  it('shows the imported settings once an import is done', async () => {
    const get = vi
      .fn<ChromeApi['settings']['get']>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ values: { [THEME]: 'system', [HARDWARE]: false } }));
    const t = api({ get });
    render(<Settings api={t} />);
    expect((await toggle()).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Import settings…' }));
    expect(await screen.findByText('Settings imported.')).toBeTruthy();
    await vi.waitFor(async () => {
      expect((await toggle()).checked).toBe(false);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps the settings when an import is cancelled or rejected', async () => {
    const t = api({
      import: vi
        .fn<ChromeApi['settings']['import']>()
        .mockResolvedValueOnce({ outcome: 'cancelled', message: '' })
        .mockResolvedValueOnce({
          outcome: 'failed',
          message: 'That file is not a YapYap settings file.',
        })
        .mockRejectedValueOnce(new Error('ipc')),
    });
    render(<Settings api={t} />);
    const button = await screen.findByRole('button', { name: 'Import settings…' });
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(t.settings.import).toHaveBeenCalledOnce();
    });
    fireEvent.click(button);
    expect(await screen.findByText('That file is not a YapYap settings file.')).toBeTruthy();
    fireEvent.click(button);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
    expect(t.settings.get).toHaveBeenCalledOnce();
  });

  it('allows export but not import when a newer YapYap owns the settings', async () => {
    render(<Settings api={api({ get: () => Promise.resolve(snapshot({ readOnly: true })) })} />);
    const exporting = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Export settings…',
    });
    expect(exporting.disabled).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Import settings…' }).disabled,
    ).toBe(true);
  });

  it('closes on Escape only', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    closeOnEscape(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(close).not.toHaveBeenCalled();
    closeOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledOnce();
    close.mockRestore();
  });
});
