/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { ChromeApi, SettingsSnapshot } from '../../shared/api/chrome-api.ts';
import { SETTING_FIELDS, type SettingValue } from '../../shared/settings-fields.ts';
import { Settings } from './Settings.tsx';

const HARDWARE = 'reliability.hardwareAcceleration';
const THEME = 'appearance.theme';

const snapshot = (overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot => ({
  values: { [THEME]: 'system', [HARDWARE]: true },
  restartPending: false,
  problems: {},
  ...overrides,
});

function api(overrides: Partial<ChromeApi['settings']> = {}, first = snapshot()) {
  return fakeChromeApi({
    settings: {
      get: vi.fn(() => Promise.resolve(first)),
      set: vi.fn((id: string, value: SettingValue) =>
        Promise.resolve(
          snapshot({
            values: { ...first.values, [id]: value },
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
      chooseFolder: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
    // Keyboard shortcuts and the spelling languages have tests of their own.
    shortcuts: { list: vi.fn(() => new Promise<never>(() => undefined)), set: vi.fn() },
    spelling: { languages: vi.fn(() => new Promise<never>(() => undefined)), choose: vi.fn() },
  });
}

const nav = () => screen.getByRole('navigation', { name: 'Settings sections' });

const open = async (page: string): Promise<void> => {
  const list = await screen.findByRole('navigation', { name: 'Settings sections' });
  fireEvent.click(within(list).getByRole('button', { name: page }));
};

const toggle = () =>
  screen.findByRole<HTMLInputElement>('switch', { name: 'Use hardware acceleration' });

const title = () => screen.getByRole('heading', { level: 1 }).textContent;

/** Each test starts with no page in the address, as a window opened from the menu does. */
const forgetPage = (): void => {
  window.history.replaceState(null, '', window.location.pathname);
};

describe('Settings', () => {
  afterEach(() => {
    cleanup();
    forgetPage();
  });

  it('lists the pages this platform has, and opens the first', async () => {
    render(<Settings api={api()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    // General has no setting in this snapshot, so the first page with one opens.
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Appearance', 'Keyboard shortcuts', 'Advanced', 'Backup']);
    expect(title()).toBe('Appearance');
    const current = within(list).getByRole('button', { name: 'Appearance' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(
      within(list).getByRole('button', { name: 'Advanced' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Use hardware acceleration' })).toBeNull();
  });

  it('opens General first, with every page beside it, the advanced ones apart', async () => {
    const values = {
      'general.autostart': false,
      'spelling.enabled': false,
      'assistant.enabled': true,
      'agents.enabled': false,
      'privacy.crashReports': 'off',
      'downloads.askWhere': false,
      'network.proxyMode': 'system',
      [THEME]: 'system',
      [HARDWARE]: true,
    };
    const settings = api({}, snapshot({ values }));
    render(<Settings api={settings} />);
    await screen.findByRole('switch', { name: 'Start at login' });
    expect(title()).toBe('General');
    expect(
      within(nav())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'General',
      'Appearance',
      'Notifications & privacy',
      'Spelling',
      'Downloads',
      'Keyboard shortcuts',
      'AI Assistant',
      'Agents',
      'Network',
      'Advanced',
      'Backup',
    ]);
    expect(nav().querySelector('li.apart')?.textContent).toBe('Advanced');
    expect(screen.getByRole('group', { name: 'Startup' })).toBeTruthy();
    // A group with no setting on this platform is left out.
    expect(screen.queryByRole('group', { name: 'Updates' })).toBeNull();
  });

  it('keeps spell checking and its languages on a page of their own', async () => {
    window.history.replaceState(null, '', '#spelling');
    render(<Settings api={api({}, snapshot({ values: { 'spelling.enabled': true } }))} />);
    expect(await screen.findByRole('switch', { name: 'Check spelling' })).toBeTruthy();
    expect(title()).toBe('Spelling');
    expect(screen.getByRole('group', { name: 'Spell checking' })).toBeTruthy();
  });

  it('opens at the page the address names, and follows the address after', async () => {
    window.history.replaceState(null, '', '#advanced');
    render(<Settings api={api()} />);
    expect(await toggle()).toBeTruthy();
    expect(title()).toBe('Advanced');
    window.history.replaceState(null, '', '#appearance');
    window.dispatchEvent(new Event('hashchange'));
    await vi.waitFor(() => {
      expect(title()).toBe('Appearance');
    });
    await open('Backup');
    expect(window.location.hash).toBe('#backup');
  });

  it('puts every setting on one of its pages', async () => {
    const values = Object.fromEntries(
      SETTING_FIELDS.map(({ id }) => [id, id === 'network.proxyMode' ? 'manual' : ''] as const),
    );
    const settings = api({}, snapshot({ values }));
    vi.mocked(settings.assistant.view).mockReturnValue(new Promise<never>(() => undefined));
    vi.mocked(settings.agents.view).mockReturnValue(new Promise<never>(() => undefined));
    render(<Settings api={settings} />);
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    const seen = new Set<string>();
    for (const button of within(list).getAllByRole('button')) {
      fireEvent.click(button);
      for (const { id } of SETTING_FIELDS) {
        if (document.getElementById(`${id}-hint`) !== null) {
          seen.add(id);
        }
      }
    }
    // The rest of the assistant's settings show once its view is read; see Assistant.test.tsx.
    const own = SETTING_FIELDS.map(({ id }) => id).filter(
      (id) => id.startsWith('assistant.') && id !== 'assistant.enabled',
    );
    expect(SETTING_FIELDS.map(({ id }) => id).filter((id) => !seen.has(id))).toEqual(own);
  });

  it('shows Keyboard shortcuts and Backup on every platform', async () => {
    render(<Settings api={api({}, snapshot({ values: {} }))} />);
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Keyboard shortcuts', 'Backup']);
    expect(title()).toBe('Keyboard shortcuts');
  });

  it('shows one page at a time, its intro under its title', async () => {
    render(<Settings api={api()} />);
    await open('Advanced');
    expect(title()).toBe('Advanced');
    expect(
      screen.getByText('Change these only if you have a problem. Most need a restart.'),
    ).toBeTruthy();
    expect(await toggle()).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull();
    await open('Appearance');
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Use hardware acceleration' })).toBeNull();
  });

  it('moves between pages with Up and Down, stopping at either end', async () => {
    render(<Settings api={api()} />);
    const list = await screen.findByRole('navigation', { name: 'Settings sections' });
    const first = within(list).getByRole('button', { name: 'Appearance' });
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(title()).toBe('Appearance');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(title()).toBe('Keyboard shortcuts');
    expect(document.activeElement?.textContent).toBe('Keyboard shortcuts');
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(title()).toBe('Keyboard shortcuts');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(title()).toBe('Advanced');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(title()).toBe('Backup');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(title()).toBe('Backup');
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(title()).toBe('Advanced');
  });

  it('also lists the pages to pick from, for a narrow window', async () => {
    render(<Settings api={api()} />);
    await screen.findByRole('navigation', { name: 'Settings sections' });
    const pick = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Settings sections' });
    expect(pick.value).toBe('appearance');
    fireEvent.change(pick, { target: { value: 'backup' } });
    expect(title()).toBe('Backup');
  });

  it('saves a switch at once, and offers a restart for a change that needs one', async () => {
    const t = api();
    render(<Settings api={t} />);
    await open('Advanced');
    const box = await toggle();
    expect(box.checked).toBe(true);
    expect(box.getAttribute('aria-describedby')).toBe(`${HARDWARE}-tag ${HARDWARE}-hint`);
    expect(document.getElementById(`${HARDWARE}-tag`)?.textContent).toBe('Needs restart');
    expect(document.getElementById(`${HARDWARE}-hint`)?.textContent).toMatch(
      /flickers or stays blank\.$/,
    );
    expect(screen.queryByRole('button', { name: 'Restart Now' })).toBeNull();
    fireEvent.click(box);
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(HARDWARE, false);
    const restart = await screen.findByRole('button', { name: 'Restart Now' });
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
    await open('Advanced');
    fireEvent.click(await toggle());
    expect(await screen.findByText('Could not save that setting. Try again.')).toBeTruthy();
    fireEvent.click(await toggle());
    await screen.findByRole('button', { name: 'Restart Now' });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('shows switches that are off as off', async () => {
    const off = snapshot({ values: { [THEME]: 'dark', [HARDWARE]: false } });
    render(<Settings api={api({}, off)} />);
    await open('Advanced');
    expect((await toggle()).checked).toBe(false);
  });

  it('says when the settings cannot be loaded', async () => {
    render(<Settings api={api({ get: () => Promise.reject(new Error('rejected')) })} />);
    expect(await screen.findByText('Settings are unavailable.')).toBeTruthy();
  });

  it('offers the theme as side-by-side choices that apply without a restart', async () => {
    const t = api();
    render(<Settings api={t} />);
    const group = await screen.findByRole('radiogroup', { name: 'Theme' });
    expect(group.getAttribute('aria-describedby')).toBe(`${THEME}-hint`);
    expect(document.getElementById(`${THEME}-hint`)?.textContent).toMatch(/System default\.$/);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'System' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith(THEME, 'dark');
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(true);
    });
    expect(screen.queryByRole('button', { name: 'Restart Now' })).toBeNull();
  });

  it('offers many options as a list, naming a value the list lacks', async () => {
    const t = api({}, snapshot({ values: { 'appearance.zoom': 1.2 } }));
    render(<Settings api={t} />);
    const scale = await screen.findByRole<HTMLSelectElement>('combobox', {
      name: 'Interface scale',
    });
    expect(scale.getAttribute('aria-describedby')).toBe('appearance.zoom-hint');
    // The View menu zooms in finer steps than the list offers.
    expect(scale.value).toBe('1.2');
    expect(scale.selectedOptions[0]?.textContent).toBe('120%');
    fireEvent.change(scale, { target: { value: '1.5' } });
    expect(t.settings.set).toHaveBeenCalledExactlyOnceWith('appearance.zoom', 1.5);
    await vi.waitFor(() => {
      expect(scale.querySelector('option[value="1.2"]')).toBeNull();
    });
    expect(scale.value).toBe('1.5');
    // A value the list never had changes nothing.
    fireEvent.change(scale, { target: { value: '7' } });
    expect(t.settings.set).toHaveBeenCalledOnce();
  });

  it('lists only the options for a value it knows, of a field that names none', async () => {
    const t = api({}, snapshot({ values: { 'privacy.crashReports': 'gone' } }));
    render(<Settings api={t} />);
    const reports = await screen.findByRole<HTMLSelectElement>('combobox', {
      name: 'Crash reports',
    });
    expect([...reports.options].map((option) => option.value)).toEqual(['off', 'local', 'ask']);
  });

  it('shows the proxy address only for a proxy of the user’s own', async () => {
    const values = { 'network.proxyMode': 'system', 'network.proxyServer': '' };
    const t = api({}, snapshot({ values }));
    render(<Settings api={t} />);
    await open('Network');
    await screen.findByRole('radiogroup', { name: 'Proxy' });
    expect(screen.queryByLabelText('Proxy address')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(await screen.findByLabelText('Proxy address')).toBeTruthy();
  });

  it('fades the folder while YapYap asks where to save each file', async () => {
    const values = { 'downloads.askWhere': true, 'downloads.folder': '' };
    render(<Settings api={api({}, snapshot({ values }))} />);
    const change = await screen.findByRole('button', { name: 'Change… Save files to' });
    expect(change.closest('.row')?.classList.contains('dimmed')).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Ask where to save each file' }));
    await vi.waitFor(() => {
      expect(change.closest('.row')?.classList.contains('dimmed')).toBe(false);
    });
  });

  it('asks main for the folder, then shows what was saved', async () => {
    const withFolder = snapshot({ values: { 'downloads.folder': '' } });
    const yapyap = api({}, withFolder);
    render(<Settings api={yapyap} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change… Save files to' }));
    expect(yapyap.settings.chooseFolder).toHaveBeenCalledExactlyOnceWith('downloads.folder');
    await vi.waitFor(() => {
      expect(yapyap.settings.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Settings › Backup', () => {
  afterEach(() => {
    cleanup();
    forgetPage();
  });

  it('exports the settings and says how it went', async () => {
    const t = api();
    render(<Settings api={t} />);
    await open('Backup');
    const exportButton = screen.getByRole('button', { name: 'Export Settings…' });
    expect(
      document.getElementById(String(exportButton.getAttribute('aria-describedby'))),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Settings file' }).textContent).toContain(
      'never includes your WhatsApp login or chats',
    );
    fireEvent.click(exportButton);
    expect(await screen.findByText('Settings exported.')).toBeTruthy();
    expect(t.settings.export).toHaveBeenCalledOnce();
    expect(t.settings.get).toHaveBeenCalledOnce();
  });

  it('shows the imported settings once an import is done', async () => {
    const get = vi
      .fn<ChromeApi['settings']['get']>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ values: { [THEME]: 'system', [HARDWARE]: false } }));
    render(<Settings api={api({ get })} />);
    await open('Backup');
    fireEvent.click(screen.getByRole('button', { name: 'Import Settings…' }));
    expect(await screen.findByText('Settings imported.')).toBeTruthy();
    await vi.waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
    await open('Advanced');
    expect((await toggle()).checked).toBe(false);
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
    await open('Backup');
    const button = screen.getByRole('button', { name: 'Import Settings…' });
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
});

describe('Settings › Assistant and Agents', () => {
  afterEach(() => {
    cleanup();
    forgetPage();
  });

  it('shows each in a page of its own, when this build has it', async () => {
    const values = { 'assistant.enabled': true, 'agents.enabled': false, [HARDWARE]: true };
    const settings = api({}, snapshot({ values }));
    vi.mocked(settings.assistant.view).mockReturnValue(new Promise<never>(() => undefined));
    vi.mocked(settings.agents.view).mockReturnValue(new Promise<never>(() => undefined));
    render(<Settings api={settings} />);
    await open('AI Assistant');
    expect(screen.getByText(/never sends a message/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Show the AI assistant in chats' }));
    expect(settings.settings.set).toHaveBeenCalledWith('assistant.enabled', false);
    await open('Agents');
    expect(screen.getByRole('switch', { name: 'Let AI agents connect' })).toBeTruthy();
  });
});
