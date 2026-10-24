import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema } from '@yapyap/plugin-sdk';
import { compareCodeUnits } from '@yapyap/plugin-sign';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * Plugin IDs start with a letter, so a leading dot keeps this file from ever
 * sharing a name with a plugin's folder in the same directory.
 */
export const RECORDS_FILE = '.plugins.json';
const RECORDS_VERSION = 1;
const FINGERPRINT = '^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$';

const ACCOUNT_ID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/** Room for every capability and every host a plugin can hold. */
const Revocations = Type.Array(Type.String({ maxLength: 300 }), {
  maxItems: 64,
  uniqueItems: true,
});

const PluginRecordSchema = Type.Object(
  {
    id: ManifestSchema.properties.id,
    version: ManifestSchema.properties.version,
    /** The pinned key; null only for an unsigned plugin installed in Developer Mode. */
    fingerprint: Type.Union([Type.String({ pattern: FINGERPRINT }), Type.Null()]),
    firstParty: Type.Boolean(),
    /** Unsigned, so the chrome keeps an "Unsigned" badge on it (ADR 0004). */
    developer: Type.Boolean(),
    capabilities: ManifestSchema.properties.capabilities,
    hosts: ManifestSchema.properties.network.properties.hosts,
    /** Capabilities and `network:<host>` grants the user took back from the whole plugin (#94). */
    revoked: Type.Optional(Revocations),
    /** Account capabilities the user took back for one account, by account ID. */
    revokedIn: Type.Optional(
      Type.Record(Type.String({ pattern: ACCOUNT_ID }), Revocations, { maxProperties: 32 }),
    ),
  },
  { additionalProperties: false },
);

/** An installed plugin: which version, the key pinned to it, and what the user granted. */
export type PluginRecord = Static<typeof PluginRecordSchema>;

/** Installed plugins by ID. */
export type PluginRecords = ReadonlyMap<string, PluginRecord>;

function isRecord(id: string, value: unknown): value is PluginRecord {
  return (
    Value.Check(PluginRecordSchema, value) &&
    value.id === id &&
    value.developer === (value.fingerprint === null)
  );
}

/** Reads the records file; unreadable or malformed entries record nothing, like the pin file. */
export function readRecords(text: string): PluginRecords {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Map();
  }
  const { plugins } = Object(value) as { plugins?: unknown };
  const entries = Object.entries(Object(plugins) as Record<string, unknown>);
  return new Map(entries.filter((entry): entry is [string, PluginRecord] => isRecord(...entry)));
}

/** The records file's text, sorted so it changes only when a record does. */
export function writeRecords(records: PluginRecords): string {
  const sorted = Object.fromEntries([...records].sort(([a], [b]) => compareCodeUnits(a, b)));
  return `${JSON.stringify({ version: RECORDS_VERSION, plugins: sorted }, null, 2)}\n`;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** No file yet means nothing is installed; any other read error is not hidden. */
export async function loadRecords(root: string): Promise<PluginRecords> {
  try {
    return readRecords(await readFile(join(root, RECORDS_FILE), 'utf8'));
  } catch (error) {
    if (isMissing(error)) {
      return new Map();
    }
    throw error;
  }
}

/** Writes a fresh file and renames it over the old one, so a crash never leaves half a file. */
export async function saveRecords(root: string, records: PluginRecords): Promise<void> {
  const path = join(root, RECORDS_FILE);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx');
    try {
      await file.writeFile(writeRecords(records));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
