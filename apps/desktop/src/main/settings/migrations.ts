import { SETTINGS_VERSION } from './schema.ts';

type Raw = Record<string, unknown>;

/**
 * `MIGRATIONS[n]` turns a version n+1 file into version n+2. They are pure,
 * forward-only, and each has its own test; a test also checks that there is
 * exactly one migration per version step.
 */
export const MIGRATIONS: readonly ((settings: Raw) => Raw)[] = [];

export type MigrationResult =
  | { readonly kind: 'migrated'; readonly settings: Raw }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'invalid' };

/** Brings a parsed file of any older version up to the current one. */
export function migrate(
  settings: Raw,
  migrations: readonly ((settings: Raw) => Raw)[] = MIGRATIONS,
  current = SETTINGS_VERSION,
): MigrationResult {
  const version = settings['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid' };
  }
  if (version > current) return { kind: 'newer', version };
  const migrated = migrations.slice(version - 1).reduce((result, step) => step(result), settings);
  return { kind: 'migrated', settings: { ...migrated, schemaVersion: current } };
}
