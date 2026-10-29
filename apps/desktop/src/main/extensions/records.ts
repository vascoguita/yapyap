import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema } from '@yapyap/extension-sdk';
import { compareCodeUnits } from '@yapyap/extension-sign';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { MAX_LOCAL_SERVERS } from './network-policy.ts';

/**
 * Extension IDs start with a letter, so a leading dot keeps this file from ever
 * sharing a name with an extension's folder in the same directory.
 */
export const RECORDS_FILE = '.extensions.json';
const RECORDS_VERSION = 1;
const FINGERPRINT = '^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$';

const LOCAL_SERVER = String.raw`^(?:localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}$`;

const ACCOUNT_ID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/** Room for every capability and every host an extension can hold. */
const Revocations = Type.Array(Type.String({ maxLength: 300 }), {
  maxItems: 64,
  uniqueItems: true,
});

const ExtensionRecordSchema = Type.Object(
  {
    id: ManifestSchema.properties.id,
    version: ManifestSchema.properties.version,
    /** The pinned key; null only for an unsigned extension installed in Developer Mode. */
    fingerprint: Type.Union([Type.String({ pattern: FINGERPRINT }), Type.Null()]),
    firstParty: Type.Boolean(),
    /** Unsigned, so the chrome keeps an "Unsigned" badge on it (ADR 0004). */
    developer: Type.Boolean(),
    capabilities: ManifestSchema.properties.capabilities,
    hosts: ManifestSchema.properties.network.properties.hosts,
    /** Servers on this computer the user let it use with `local-network` (#430), as `host:port`. */
    localServers: Type.Optional(
      Type.Array(Type.String({ pattern: LOCAL_SERVER }), {
        maxItems: MAX_LOCAL_SERVERS,
        uniqueItems: true,
      }),
    ),
    /** Capabilities and `network:<host>` grants the user took back from the whole extension (#94). */
    revoked: Type.Optional(Revocations),
    /** What the user filled in the extension's settings form (#98). */
    // TypeBox ignores a Record key schema's limits; `propertyNames` enforces them.
    settings: Type.Optional(
      Type.Record(
        Type.String(),
        Type.Union([Type.String({ maxLength: 1000 }), Type.Number(), Type.Boolean()]),
        { maxProperties: 32, propertyNames: { maxLength: 64 } },
      ),
    ),
    /**
     * Why the marketplace pulled this version (ADR 0014): YapYap does not
     * start it, but keeps it and its data until the user removes it.
     * Installing another version clears it.
     */
    pulled: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    /** Account capabilities the user took back for one account, by account ID. */
    revokedIn: Type.Optional(
      Type.Record(Type.String(), Revocations, {
        maxProperties: 32,
        propertyNames: { pattern: ACCOUNT_ID },
      }),
    ),
  },
  { additionalProperties: false },
);

/** An installed extension: which version, the key pinned to it, and what the user granted. */
export type ExtensionRecord = Static<typeof ExtensionRecordSchema>;

/** Installed extensions by ID. */
export type ExtensionRecords = ReadonlyMap<string, ExtensionRecord>;

function isRecord(id: string, value: unknown): value is ExtensionRecord {
  return (
    Value.Check(ExtensionRecordSchema, value) &&
    value.id === id &&
    value.developer === (value.fingerprint === null)
  );
}

/** Reads the records file; unreadable or malformed entries record nothing, like the pin file. */
export function readRecords(text: string): ExtensionRecords {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Map();
  }
  const { extensions } = Object(value) as { extensions?: unknown };
  const entries = Object.entries(Object(extensions) as Record<string, unknown>);
  return new Map(entries.filter((entry): entry is [string, ExtensionRecord] => isRecord(...entry)));
}

/** The records file's text, sorted so it changes only when a record does. */
export function writeRecords(records: ExtensionRecords): string {
  const sorted = Object.fromEntries([...records].sort(([a], [b]) => compareCodeUnits(a, b)));
  return `${JSON.stringify({ version: RECORDS_VERSION, extensions: sorted }, null, 2)}\n`;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** No file yet means nothing is installed; any other read error is not hidden. */
export async function loadRecords(root: string): Promise<ExtensionRecords> {
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
export async function saveRecords(root: string, records: ExtensionRecords): Promise<void> {
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
