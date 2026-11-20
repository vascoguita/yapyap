import {
  CHROME_CHANNELS,
  MAX_SPELLING_LANGUAGES,
  type SpellingLanguages,
} from '../../shared/api/chrome-api.ts';
import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';
import type { DictionaryWatch } from './dictionaries.ts';
import { spellingLanguagesOf } from './spelling.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Where Settings' languages come from. */
export interface SpellingSources {
  /** The languages Chromium has dictionaries for; empty on macOS. */
  readonly available: () => readonly string[];
  /** `app.getPreferredSystemLanguages()`. */
  readonly system: () => readonly string[];
  readonly dictionaries: DictionaryWatch;
  /** Opens a folder in the system's file manager. */
  readonly open: (path: string) => Promise<unknown>;
}

const inUseOf = (settings: Settings, sources: SpellingSources): string[] =>
  spellingLanguagesOf(settings.spelling.languages, sources.system(), sources.available());

async function snapshotOf(
  settings: Settings,
  sources: SpellingSources,
): Promise<SpellingLanguages> {
  const inUse = inUseOf(settings, sources);
  const { dictionaries } = sources;
  return {
    available: sources.available(),
    chosen: settings.spelling.languages,
    inUse,
    dictionaries: await dictionaries.states(inUse, settings.spelling.enabled),
    folder: dictionaries.folder,
    unused: (await dictionaries.unused(inUse)).length,
  };
}

/** Only distinct languages that have a dictionary, and no more than the limit. */
function acceptsLanguages(languages: unknown, available: readonly string[]): boolean {
  return (
    Array.isArray(languages) &&
    languages.length <= MAX_SPELLING_LANGUAGES &&
    new Set(languages).size === languages.length &&
    languages.every((language) => typeof language === 'string' && available.includes(language))
  );
}

/** Settings › Spelling's operations on the downloaded dictionaries (#704). */
function dictionaryHandlers(
  settings: Pick<SettingsService, 'current'>,
  sources: SpellingSources,
  snapshot: () => Promise<SpellingLanguages>,
): ChromeHandler[] {
  const { dictionaries } = sources;
  return [
    {
      channel: CHROME_CHANNELS.spellingRetry,
      accepts: noArguments,
      handle: () => {
        dictionaries.retry();
        return snapshot();
      },
    },
    {
      channel: CHROME_CHANNELS.spellingShowFolder,
      accepts: noArguments,
      handle: async () => {
        await sources.open(dictionaries.folder);
      },
    },
    {
      channel: CHROME_CHANNELS.spellingRemoveUnused,
      accepts: noArguments,
      handle: async () => {
        await dictionaries.removeUnused(inUseOf(settings.current(), sources));
        return snapshot();
      },
    },
  ];
}

/** Settings › Spelling's operations on the languages (#73). */
export function spellingHandlers(
  settings: Pick<SettingsService, 'current' | 'update'>,
  sources: SpellingSources,
): ChromeHandler[] {
  const snapshot = (): Promise<SpellingLanguages> => snapshotOf(settings.current(), sources);
  return [
    { channel: CHROME_CHANNELS.spellingLanguages, accepts: noArguments, handle: snapshot },
    {
      channel: CHROME_CHANNELS.spellingChoose,
      accepts: argumentsOf((languages) => acceptsLanguages(languages, sources.available())),
      handle: (_call, languages) => {
        settings.update((current) => ({
          ...current,
          spelling: { ...current.spelling, languages: [...(languages as string[])] },
        }));
        return snapshot();
      },
    },
    ...dictionaryHandlers(settings, sources, snapshot),
  ];
}
