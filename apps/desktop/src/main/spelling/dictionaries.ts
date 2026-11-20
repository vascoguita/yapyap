import type { DictionaryState } from '../../shared/api/chrome-api.ts';

/** The events Electron sends about a session's spelling dictionaries, each with its language. */
const EVENTS = {
  'spellcheck-dictionary-download-begin': 'downloading',
  'spellcheck-dictionary-download-success': 'ready',
  'spellcheck-dictionary-initialized': 'ready',
  'spellcheck-dictionary-download-failure': 'failed',
} as const satisfies Record<string, DictionaryState>;

type DictionaryEvent = keyof typeof EVENTS;

/** What the watch needs of an account's session. */
export interface DictionarySession {
  on(event: DictionaryEvent, listener: (event: unknown, language: string) => void): unknown;
  getSpellCheckerLanguages(): string[];
  setSpellCheckerLanguages(languages: string[]): void;
}

/** The dictionaries folder, as far as the watch reads and changes it. */
export interface DictionaryFolder {
  /** Where Chromium keeps the dictionaries it downloads: the profile's `Dictionaries`. */
  readonly path: string;
  /** The files in it, by name; none when it does not exist yet. */
  readonly files: () => Promise<readonly string[]>;
  readonly remove: (name: string) => Promise<void>;
}

/**
 * The language a dictionary file is for: Chromium names them by language
 * and version, such as `en-GB-10-1.bdic`.
 */
export function languageOfFile(name: string): string | undefined {
  return /^([a-z]{2,3}(?:-[A-Za-z]{2,4})*)-\d+-\d+\.bdic$/.exec(name)?.[1];
}

/** Whether a dictionary file serves a language, such as `de-DE-3-0.bdic` for `de`. */
const serves = (file: string, language: string): boolean =>
  file === language || file.startsWith(`${language}-`) || language.startsWith(`${file}-`);

/** Each language's dictionary and the files no language in use needs (#704). */
export interface DictionaryWatch {
  /** Follows a session's downloads; every account's session shares the one folder. */
  readonly watch: (session: DictionarySession) => void;
  /** How each language's dictionary stands: the last event about it, else ready if its file is there. */
  readonly states: (languages: readonly string[]) => Promise<Record<string, DictionaryState>>;
  /** The dictionary files no language in `inUse` needs. */
  readonly unused: (inUse: readonly string[]) => Promise<string[]>;
  readonly removeUnused: (inUse: readonly string[]) => Promise<void>;
  /** Asks Chromium again for the dictionaries that failed, by setting each session's languages anew. */
  readonly retry: () => void;
  readonly folder: string;
}

/** The dictionary files in the folder no language in `inUse` needs. */
async function unusedIn(folder: DictionaryFolder, inUse: readonly string[]): Promise<string[]> {
  return (await folder.files()).filter((name) => {
    const file = languageOfFile(name);
    return file !== undefined && !inUse.some((language) => serves(file, language));
  });
}

/** Each language's state: the last event about it, else ready if a file in the folder serves it. */
async function statesIn(
  folder: DictionaryFolder,
  seen: ReadonlyMap<string, DictionaryState>,
  languages: readonly string[],
): Promise<Record<string, DictionaryState>> {
  const files = (await folder.files()).flatMap((name) => languageOfFile(name) ?? []);
  const stateOf = (language: string): DictionaryState | undefined =>
    seen.get(language) ?? (files.some((file) => serves(file, language)) ? 'ready' : undefined);
  return Object.fromEntries(
    languages.flatMap((language) => {
      const state = stateOf(language);
      return state === undefined ? [] : [[language, state]];
    }),
  );
}

/** Watches the dictionaries Chromium downloads for spell checking (#704). */
export function watchDictionaries(folder: DictionaryFolder): DictionaryWatch {
  const seen = new Map<string, DictionaryState>();
  const sessions = new Set<DictionarySession>();
  return {
    folder: folder.path,
    watch: (session) => {
      sessions.add(session);
      for (const [event, state] of Object.entries(EVENTS)) {
        session.on(event as DictionaryEvent, (_event, language) => {
          seen.set(language, state);
        });
      }
    },
    states: (languages) => statesIn(folder, seen, languages),
    unused: (inUse) => unusedIn(folder, inUse),
    removeUnused: async (inUse) => {
      for (const name of await unusedIn(folder, inUse)) {
        await folder.remove(name);
      }
    },
    retry: () => {
      for (const session of sessions) {
        const languages = session.getSpellCheckerLanguages();
        // Chromium asks for a dictionary again only when the list changes.
        session.setSpellCheckerLanguages([]);
        session.setSpellCheckerLanguages(languages);
      }
    },
  };
}
