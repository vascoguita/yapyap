import { describe, expect, it, vi } from 'vitest';
import { languageOfFile, watchDictionaries, type DictionarySession } from './dictionaries.ts';

/** A session that remembers its listeners, so a test can send it Electron's events. */
function fakeSession(languages: string[] = ['en-GB']) {
  const listeners = new Map<string, (event: unknown, language: string) => void>();
  const session = {
    on: vi.fn((event: string, listener: (event: unknown, language: string) => void) => {
      listeners.set(event, listener);
    }),
    getSpellCheckerLanguages: vi.fn(() => languages),
    setSpellCheckerLanguages: vi.fn(),
  } satisfies DictionarySession;
  const emit = (event: string, language: string): void => {
    listeners.get(`spellcheck-dictionary-${event}`)?.({}, language);
  };
  return { session, emit };
}

function setup(files: string[] = []) {
  const folder = {
    path: '/profile/Dictionaries',
    files: vi.fn(() => Promise.resolve(files)),
    remove: vi.fn(() => Promise.resolve()),
  };
  return { folder, watch: watchDictionaries(folder) };
}

describe('languageOfFile', () => {
  it('reads the language from Chromium’s dictionary file names', () => {
    expect(languageOfFile('en-GB-10-1.bdic')).toBe('en-GB');
    expect(languageOfFile('pt-BR-3-0.bdic')).toBe('pt-BR');
    expect(languageOfFile('sv-SE-3-0.bdic')).toBe('sv-SE');
    expect(languageOfFile('es-419-1-0.bdic')).toBeUndefined();
    expect(languageOfFile('notes.txt')).toBeUndefined();
    expect(languageOfFile('en-GB.bdic')).toBeUndefined();
  });
});

describe('watchDictionaries', () => {
  it('tells each language’s dictionary as Chromium downloads it, else ready when its file is there', async () => {
    const t = setup(['de-DE-3-0.bdic', 'notes.txt']);
    const page = fakeSession();
    t.watch.watch(page.session);
    expect(t.watch.folder).toBe('/profile/Dictionaries');
    await expect(t.watch.states(['en-GB', 'de', 'fr-FR'])).resolves.toEqual({ de: 'ready' });
    page.emit('download-begin', 'en-GB');
    await expect(t.watch.states(['en-GB'])).resolves.toEqual({ 'en-GB': 'downloading' });
    page.emit('download-failure', 'en-GB');
    await expect(t.watch.states(['en-GB'])).resolves.toEqual({ 'en-GB': 'failed' });
    page.emit('download-success', 'en-GB');
    await expect(t.watch.states(['en-GB'])).resolves.toEqual({ 'en-GB': 'ready' });
    page.emit('initialized', 'fr-FR');
    await expect(t.watch.states(['fr-FR'])).resolves.toEqual({ 'fr-FR': 'ready' });
  });

  it('finds and removes only the files no language in use needs', async () => {
    const t = setup(['en-GB-10-1.bdic', 'de-DE-3-0.bdic', 'pt-PT-3-0.bdic', 'notes.txt']);
    await expect(t.watch.unused(['en-GB', 'de'])).resolves.toEqual(['pt-PT-3-0.bdic']);
    await expect(t.watch.unused(['de-DE-x', 'pt'])).resolves.toEqual(['en-GB-10-1.bdic']);
    await t.watch.removeUnused(['en-GB', 'de']);
    expect(t.folder.remove).toHaveBeenCalledExactlyOnceWith('pt-PT-3-0.bdic');
  });

  it('asks again for every session’s dictionaries by setting its languages anew', () => {
    const t = setup();
    const one = fakeSession(['en-GB']);
    const two = fakeSession(['pt-PT', 'de-DE']);
    t.watch.watch(one.session);
    t.watch.watch(two.session);
    t.watch.retry();
    expect(one.session.setSpellCheckerLanguages.mock.calls).toEqual([[[]], [['en-GB']]]);
    expect(two.session.setSpellCheckerLanguages.mock.calls).toEqual([[[]], [['pt-PT', 'de-DE']]]);
  });
});
