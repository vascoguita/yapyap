/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeChromeApi } from '../../../test/chrome-api.ts';
import type { SettingsSnapshot, SpellingLanguages } from '../../shared/api/chrome-api.ts';
import { languageNames, SpellingSection } from './Spelling.tsx';

const AVAILABLE = [
  'da',
  'de-DE',
  'en-GB',
  'en-US',
  'es-419',
  'fr-FR',
  'it-IT',
  'nb',
  'nl',
  'pl',
  'pt-PT',
  'sv',
];

function api(initial: Partial<SpellingLanguages>) {
  let state: SpellingLanguages = {
    available: AVAILABLE,
    chosen: [],
    inUse: ['en-GB'],
    dictionaries: {},
    folder: '/profile/Dictionaries',
    unused: 0,
    ...initial,
  };
  const choose = vi.fn((languages: readonly string[]) => {
    state = { ...state, chosen: languages, inUse: languages.length > 0 ? languages : ['en-GB'] };
    return Promise.resolve(state);
  });
  const set = (next: Partial<SpellingLanguages>): void => {
    state = { ...state, ...next };
  };
  const answer = vi.fn(() => Promise.resolve(state));
  const fake = fakeChromeApi({
    spelling: {
      languages: vi.fn(() => Promise.resolve(state)),
      choose,
      retry: answer,
      removeUnused: vi.fn(() => {
        state = { ...state, unused: 0 };
        return Promise.resolve(state);
      }),
      showFolder: vi.fn(() => Promise.resolve()),
    },
  });
  return Object.assign(fake, { set });
}

const snapshot = (enabled = true): SettingsSnapshot => ({
  values: { 'spelling.enabled': enabled },
  restartPending: false,
  platform: 'linux',
  problems: {},
});

function show(yapyap: ReturnType<typeof api>, enabled = true) {
  const onChange = vi.fn();
  render(<SpellingSection api={yapyap} snapshot={snapshot(enabled)} onChange={onChange} />);
  return onChange;
}

const box = (name: string) =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: new RegExp(name) });

describe('languageNames', () => {
  it('names a language in itself and in English, or by its code when unknown', () => {
    expect(languageNames('pt-PT')).toEqual({
      own: 'português (Portugal)',
      english: 'Portuguese (Portugal)',
    });
    expect(languageNames('qaa')).toEqual({ own: 'qaa', english: 'qaa' });
  });
});

describe('SpellingSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('turns spell checking on and off from its switch', async () => {
    const onChange = show(api({}), false);
    fireEvent.click(await screen.findByRole('switch', { name: 'Check spelling' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('spelling.enabled', true);
  });

  it('checks the system language until the user picks others, and can go back to it', async () => {
    const yapyap = api({});
    show(yapyap);
    expect(
      await screen.findByText('Your system’s language: English (United Kingdom)'),
    ).toBeTruthy();
    expect(screen.getByText('Or choose up to 10 languages below.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use System Language' })).toBeNull();
    fireEvent.click(box('português'));
    await waitFor(() => {
      expect(box('português').checked).toBe(true);
    });
    expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['pt-PT']);
    expect(screen.getByText('1 of 10 languages chosen')).toBeTruthy();
    fireEvent.click(box('Deutsch'));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['pt-PT', 'de-DE']);
    });
    fireEvent.click(box('português'));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith(['de-DE']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use System Language' }));
    await waitFor(() => {
      expect(yapyap.spelling.choose).toHaveBeenLastCalledWith([]);
    });
  });

  it('finds a language by its own name, its English name or its code, ignoring accents', async () => {
    show(api({}));
    const search = await screen.findByRole('searchbox', { name: 'Search languages' });
    fireEvent.input(search, { target: { value: 'portugues' } });
    expect(
      screen.getAllByRole('checkbox').map((input) => input.closest('label')?.textContent),
    ).toEqual(['português (Portugal)Portuguese (Portugal)']);
    fireEvent.input(search, { target: { value: 'German' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.input(search, { target: { value: 'es-419' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.input(search, { target: { value: 'klingon' } });
    expect(screen.getByText('No language matches your search.')).toBeTruthy();
  });

  it('lists the chosen languages first and stops at ten', async () => {
    const chosen = AVAILABLE.slice(2, 12);
    show(api({ chosen, inUse: chosen }));
    const boxes = await screen.findAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.slice(0, 10).every((input) => input.checked && !input.disabled)).toBe(true);
    expect(boxes.slice(10).every((input) => !input.checked && input.disabled)).toBe(true);
  });

  it('fades the languages while spell checking is off, and says when no dictionary fits', async () => {
    show(api({ inUse: [] }), false);
    const summary = await screen.findByText('No dictionary for your system’s language');
    expect(screen.getByText('Choose up to 10 languages below.')).toBeTruthy();
    expect(summary.closest('.row')?.classList.contains('dimmed')).toBe(true);
    expect(screen.getByRole('list').classList.contains('dimmed')).toBe(true);
    expect(box('português').disabled).toBe(false);
  });

  it('shows the languages at full strength while spell checking is on', async () => {
    show(api({}));
    const summary = await screen.findByText(/Your system’s language/);
    expect(summary.closest('.row')?.classList.contains('dimmed')).toBe(false);
    expect(screen.getByRole('list').classList.contains('dimmed')).toBe(false);
  });

  it('leaves languages to macOS, which lists none', async () => {
    show(api({ available: [], inUse: [] }), false);
    const note = await screen.findByText(/macOS checks spelling/);
    expect(screen.getByText('Chosen by macOS')).toBeTruthy();
    expect(note.closest('.row')?.classList.contains('dimmed')).toBe(true);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows the macOS note at full strength while spell checking is on', async () => {
    show(api({ available: [], inUse: [] }));
    const note = await screen.findByText(/macOS checks spelling/);
    expect(note.closest('.row')?.classList.contains('dimmed')).toBe(false);
  });
});

describe('SpellingSection’s dictionaries (#704)', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows a download with the working edge, a failure with Try Again, and nothing for one already there (#741)', async () => {
    const yapyap = api({
      chosen: ['pt-PT', 'de-DE', 'sv'],
      inUse: ['pt-PT', 'de-DE', 'sv'],
      dictionaries: { 'pt-PT': 'ready', 'de-DE': 'failed', sv: 'downloading' },
    });
    show(yapyap);
    await screen.findByText('Could not download');
    expect(screen.getByText('Downloading…').getAttribute('class')).toBe('dictionary-pill working');
    expect(screen.queryByText('Ready')).toBeNull();
    // One download alone is told on its row only.
    expect(screen.queryByText(/Downloading \d dictionar/)).toBeNull();
    yapyap.set({ dictionaries: { 'pt-PT': 'ready', 'de-DE': 'downloading', sv: 'ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(yapyap.spelling.retry).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByText('Could not download')).toBeNull();
    });
    // Trying again does not tick or untick the language.
    expect(yapyap.spelling.choose).not.toHaveBeenCalled();
  });

  it('tells several downloads at once in the summary too, as their rows may be out of view', async () => {
    const yapyap = api({
      chosen: ['pt-PT', 'sv'],
      inUse: ['pt-PT', 'sv'],
      dictionaries: { 'pt-PT': 'downloading', sv: 'downloading' },
    });
    show(yapyap);
    await screen.findByText('Downloading 2 dictionaries…');
  });

  it('asks again every second while a dictionary downloads, says Downloaded for a while, then nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const yapyap = api({ inUse: ['en-GB'], dictionaries: { 'en-GB': 'downloading' } });
    show(yapyap);
    await screen.findByText('Downloading…');
    yapyap.set({ dictionaries: { 'en-GB': 'ready' } });
    await vi.advanceTimersByTimeAsync(1000);
    await screen.findByText('Downloaded');
    const asked = vi.mocked(yapyap.spelling.languages).mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    await waitFor(() => {
      expect(screen.queryByText('Downloaded')).toBeNull();
    });
    expect(vi.mocked(yapyap.spelling.languages).mock.calls).toHaveLength(asked);
  });

  it('asks again when spell checking is turned on, which starts the downloads', async () => {
    const yapyap = api({});
    const { rerender } = render(
      <SpellingSection api={yapyap} snapshot={snapshot(false)} onChange={vi.fn()} />,
    );
    await waitFor(() => {
      expect(yapyap.spelling.languages).toHaveBeenCalledOnce();
    });
    rerender(<SpellingSection api={yapyap} snapshot={snapshot(true)} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(yapyap.spelling.languages).toHaveBeenCalledTimes(2);
    });
  });

  it('says where dictionaries stay, opens the folder, and removes the unused ones', async () => {
    const yapyap = api({ unused: 2 });
    show(yapyap);
    await screen.findByText(/in \/profile\/Dictionaries\./);
    fireEvent.click(screen.getByRole('button', { name: 'Show Folder' }));
    expect(yapyap.spelling.showFolder).toHaveBeenCalledOnce();
    expect(screen.getByText('2 dictionaries are not used by any language you check.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Unused' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove Unused' })).toBeNull();
    });
  });

  it('shows no dictionaries on macOS, which keeps its own', async () => {
    const yapyap = api({ available: [], inUse: [] });
    show(yapyap);
    await screen.findByText('Chosen by macOS');
    expect(screen.queryByText('Dictionaries')).toBeNull();
  });
});
