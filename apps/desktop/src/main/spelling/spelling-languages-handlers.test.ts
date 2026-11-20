import { describe, expect, it, vi } from 'vitest';
import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { spellingHandlers } from './spelling-languages-handlers.ts';

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

function setup(spelling: Partial<Settings['spelling']> = {}) {
  const base = defaultSettings();
  let settings: Settings = { ...base, spelling: { ...base.spelling, ...spelling } };
  const service = {
    current: () => settings,
    update: (change: (current: Settings) => Settings) => {
      settings = change(settings);
    },
  };
  const dictionaries = {
    folder: '/profile/Dictionaries',
    watch: vi.fn(),
    states: vi.fn((languages: readonly string[]) =>
      Promise.resolve(
        Object.fromEntries(languages.map((language) => [language, 'ready' as const])),
      ),
    ),
    unused: vi.fn((inUse: readonly string[]) =>
      Promise.resolve(inUse.includes('pt-PT') ? [] : ['pt-PT-3-0.bdic']),
    ),
    removeUnused: vi.fn(() => Promise.resolve()),
    retry: vi.fn(),
  };
  const open = vi.fn(() => Promise.resolve(''));
  const handlers = spellingHandlers(service, {
    available: () => AVAILABLE,
    system: () => ['en-GB'],
    dictionaries,
    open,
  });
  const handler = (channel: string) => {
    const found = handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}.`);
    }
    return found;
  };
  return { handler, settings: () => settings, dictionaries, open };
}

const call = { sender: {} } as never;

describe('spellingHandlers', () => {
  it('lists the languages, the chosen ones, those in use and their dictionaries', async () => {
    const t = setup({ enabled: true });
    const languages = t.handler(CHROME_CHANNELS.spellingLanguages);
    expect(languages.accepts([])).toBe(true);
    expect(languages.accepts(['extra'])).toBe(false);
    await expect(languages.handle(call)).resolves.toEqual({
      available: AVAILABLE,
      chosen: [],
      inUse: ['en-GB'],
      dictionaries: { 'en-GB': 'ready' },
      folder: '/profile/Dictionaries',
      unused: 1,
    });
  });

  it('asks again for dictionaries, shows their folder, and removes those not in use (#704)', async () => {
    const t = setup({ enabled: true, languages: ['pt-PT'] });
    for (const channel of [
      CHROME_CHANNELS.spellingRetry,
      CHROME_CHANNELS.spellingShowFolder,
      CHROME_CHANNELS.spellingRemoveUnused,
    ]) {
      expect(t.handler(channel).accepts([])).toBe(true);
      expect(t.handler(channel).accepts(['extra'])).toBe(false);
    }
    await expect(t.handler(CHROME_CHANNELS.spellingRetry).handle(call)).resolves.toMatchObject({
      inUse: ['pt-PT'],
    });
    expect(t.dictionaries.retry).toHaveBeenCalledOnce();
    await t.handler(CHROME_CHANNELS.spellingShowFolder).handle(call);
    expect(t.open).toHaveBeenCalledExactlyOnceWith('/profile/Dictionaries');
    await expect(
      t.handler(CHROME_CHANNELS.spellingRemoveUnused).handle(call),
    ).resolves.toMatchObject({ unused: 0 });
    expect(t.dictionaries.removeUnused).toHaveBeenCalledExactlyOnceWith(['pt-PT']);
  });

  it('saves languages that have a dictionary and answers with what is now in use', async () => {
    const t = setup();
    const choose = t.handler(CHROME_CHANNELS.spellingChoose);
    const chosen = ['pt-PT', 'es-419'];
    expect(choose.accepts([chosen])).toBe(true);
    await expect(choose.handle(call, chosen)).resolves.toMatchObject({ chosen, inUse: chosen });
    expect(t.settings().spelling.languages).toEqual(chosen);
    expect(choose.accepts([[]])).toBe(true);
  });

  it('refuses anything but distinct languages with a dictionary, up to the limit', () => {
    const choose = setup().handler(CHROME_CHANNELS.spellingChoose);
    expect(choose.accepts([['xx-YY']])).toBe(false);
    expect(choose.accepts([['en-GB', 'en-GB']])).toBe(false);
    expect(choose.accepts([[42]])).toBe(false);
    expect(choose.accepts(['en-GB'])).toBe(false);
    expect(choose.accepts([['en-GB'], 'extra'])).toBe(false);
    expect(choose.accepts([AVAILABLE.slice(0, 10)])).toBe(true);
    expect(choose.accepts([AVAILABLE.slice(0, 11)])).toBe(false);
  });
});
