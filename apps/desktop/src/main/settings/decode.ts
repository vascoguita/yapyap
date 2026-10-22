import { Value } from 'typebox/value';
import { migrate } from './migrations.ts';
import { SettingsSchema, SETTINGS_VERSION, type Settings } from './schema.ts';

export type Decoded =
  | {
      readonly kind: 'ok';
      readonly settings: Settings;
      /** JSON pointers of values that were invalid and are now their defaults. */
      readonly reset: readonly string[];
    }
  | { readonly kind: 'newer'; readonly settings: Settings; readonly version: number }
  | { readonly kind: 'corrupt' };

export function defaultSettings(): Settings {
  return Value.Default(SettingsSchema, { schemaVersion: SETTINGS_VERSION }) as Settings;
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
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
 * Turns a settings file into settings. A file from a newer YapYap is read as
 * far as this version understands it, and must not be overwritten.
 */
export function decodeSettings(text: string): Decoded {
  const raw = parse(text);
  if (raw === undefined) {
    return { kind: 'corrupt' };
  }
  const result = migrate(raw);
  if (result.kind === 'invalid') {
    return { kind: 'corrupt' };
  }
  if (result.kind === 'newer') {
    const { settings } = normalize({ ...raw, schemaVersion: SETTINGS_VERSION });
    return { settings, kind: 'newer', version: result.version };
  }
  return { kind: 'ok', ...normalize(result.settings) };
}
