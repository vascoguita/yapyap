import { Value } from 'typebox/value';
import { decodeSettings } from './decode.ts';
import { SettingsSchema, type Settings } from './schema.ts';

/** Marks a file as exported settings, so an unrelated JSON file is never imported. */
export const SETTINGS_EXPORT_FORMAT = 'yapyap-settings';

/** Far above any real settings file; anything bigger is not one. */
export const MAX_IMPORT_BYTES = 64 * 1024;

export type ImportResult =
  | {
      readonly kind: 'ok';
      readonly settings: Settings;
      /** JSON pointers of values that were invalid and will be their defaults. */
      readonly reset: readonly string[];
    }
  | { readonly kind: 'rejected'; readonly reason: string };

/**
 * The sections an export carries (ADR 0006). A new section stays out until
 * it is known to hold nothing private, such as partitions or pinned keys,
 * and a test fails until it is listed here or excluded on purpose.
 */
export const EXPORTED_SECTIONS = ['general', 'appearance', 'reliability', 'privacy'] as const;

/**
 * Exports the allowlisted sections, cleaned of anything the schema does not
 * define. Sessions and cookies live in Chromium's profile and secrets in
 * `safeStorage`, so they are never in the settings to begin with.
 */
export function exportSettings(settings: Settings): string {
  const clean = Value.Clean(SettingsSchema, Value.Clone(settings)) as Settings;
  const exported: Record<string, unknown> = { schemaVersion: clean.schemaVersion };
  for (const section of EXPORTED_SECTIONS) exported[section] = clean[section];
  return `${JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, settings: exported }, null, 2)}\n`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The settings inside an export, as JSON; anything else gives '', which never decodes. */
function settingsJson(text: string): string {
  const value = parseJson(text);
  return typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === SETTINGS_EXPORT_FORMAT &&
    'settings' in value
    ? JSON.stringify(value.settings)
    : '';
}

const NOT_SETTINGS: ImportResult = {
  kind: 'rejected',
  reason: 'That file is not a YapYap settings file.',
};

/** Reads an exported file through the same migrations and checks as `settings.json`. */
export function readImport(text: string): ImportResult {
  if (Buffer.byteLength(text) > MAX_IMPORT_BYTES) return NOT_SETTINGS;
  const decoded = decodeSettings(settingsJson(text));
  if (decoded.kind === 'newer')
    return {
      kind: 'rejected',
      reason: 'Those settings come from a newer version of YapYap. Update YapYap to import them.',
    };
  if (decoded.kind === 'corrupt') return NOT_SETTINGS;
  return decoded;
}
