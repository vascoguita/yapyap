import { Value } from 'typebox/value';
import { isRecord } from './record.ts';
import { SettingsSchema, SETTINGS_VERSION, type Settings } from './schema.ts';

export type Decoded =
  | {
      readonly kind: 'ok';
      readonly settings: Settings;
      /** JSON pointers of values that were invalid and are now their defaults. */
      readonly reset: readonly string[];
    }
  | { readonly kind: 'corrupt' };

export function defaultSettings(): Settings {
  return Value.Default(SettingsSchema, { schemaVersion: SETTINGS_VERSION }) as Settings;
}

/** Fills missing values with defaults and resets only the values that are invalid. */
function normalize(raw: Record<string, unknown>): { settings: Settings; reset: string[] } {
  const filled = Value.Default(SettingsSchema, structuredClone(raw));
  const reset = [
    ...new Set([...Value.Errors(SettingsSchema, filled)].map((error) => error.instancePath)),
  ];
  return { settings: Value.Repair(SettingsSchema, filled), reset };
}

/**
 * Turns a parsed settings file into settings. YapYap keeps no backward
 * compatibility before 1.0 (ADR 0008), so a file of any other version is
 * treated as corrupt.
 */
export function decodeParsed(raw: unknown): Decoded {
  if (!isRecord(raw) || raw['schemaVersion'] !== SETTINGS_VERSION) {
    return { kind: 'corrupt' };
  }
  return { kind: 'ok', ...normalize(raw) };
}

/** Turns the text of a settings file into settings; text that is no JSON is corrupt. */
export function decodeSettings(text: string): Decoded {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'corrupt' };
  }
  return decodeParsed(raw);
}
