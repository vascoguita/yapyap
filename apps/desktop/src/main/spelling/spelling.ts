import type { Settings } from '../settings/schema.ts';
import type { SettingsService } from '../settings/service.ts';

export interface SpellingSession {
  setSpellCheckerEnabled(enabled: boolean): void;
  setSpellCheckerLanguages(languages: string[]): void;
  /** Empty on macOS, whose own spell checker picks languages itself. */
  readonly availableSpellCheckerLanguages: string[];
}

/**
 * The languages to check: the ones the user chose, or else the first system
 * language with a dictionary, matched on its base language when the exact
 * region has none.
 */
export function spellingLanguagesOf(
  chosen: readonly string[],
  system: readonly string[],
  available: readonly string[],
): string[] {
  const usable = chosen.filter((language) => available.includes(language));
  if (usable.length > 0) {
    return usable;
  }
  for (const language of system) {
    const base = language.replace(/-.*/, '');
    const match =
      available.find((candidate) => candidate === language) ??
      available.find((candidate) => candidate === base || candidate.startsWith(`${base}-`));
    if (match !== undefined) {
      return [match];
    }
  }
  return [];
}

function applyTo(
  session: SpellingSession,
  spelling: Settings['spelling'],
  system: readonly string[],
): void {
  const available = session.availableSpellCheckerLanguages;
  // Chromium downloads a dictionary for each listed language, so the list
  // stays empty until the user turns spell checking on (ADR 0008, C16 and C24).
  const languages = spelling.enabled
    ? spellingLanguagesOf(spelling.languages, system, available)
    : [];
  if (available.length > 0) {
    session.setSpellCheckerLanguages(languages);
  }
  session.setSpellCheckerEnabled(spelling.enabled);
}

export interface SpellingController {
  readonly guard: (session: SpellingSession) => void;
}

/** Keeps every account's session on the spelling setting, through every change (#73). */
export function followSpellingSetting(
  settings: Pick<SettingsService, 'current' | 'onChange'>,
  systemLanguages: () => readonly string[],
): SpellingController {
  const sessions = new Set<SpellingSession>();
  settings.onChange((current) => {
    for (const session of sessions) {
      applyTo(session, current.spelling, systemLanguages());
    }
  });
  return {
    guard: (session) => {
      sessions.add(session);
      applyTo(session, settings.current().spelling, systemLanguages());
    },
  };
}
