import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomically } from '../atomic-write.ts';

const FILE_VERSION = 1;

/** Room for a plugin's preferences and caches, not for a database. */
export const STORE_LIMIT = 1024 * 1024;

/** Read and write for the user alone: values can hold what a plugin learned from chats. */
const OWNER_ONLY = 0o600;
const OWNER_ONLY_FOLDER = 0o700;

/** A plugin's private key-value store (`storage:local`, ADR 0004). */
export interface KeyValueStore {
  /** The value stored under `key`, or undefined. */
  readonly get: (key: string) => unknown;
  /**
   * Stores `value` as JSON under `key`; false when the store would grow
   * past {@link STORE_LIMIT}. Throws for a value JSON cannot hold.
   */
  readonly set: (key: string, value: unknown) => boolean;
  readonly delete: (key: string) => void;
}

function load(path: string): Map<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      version?: unknown;
      entries?: unknown;
    };
    const entries = parsed.version === FILE_VERSION ? parsed.entries : undefined;
    if (typeof entries !== 'object' || entries === null) {
      return new Map();
    }
    return new Map(
      Object.entries(entries).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return new Map();
  }
}

const sizeOf = (entries: ReadonlyMap<string, string>): number =>
  [...entries].reduce((total, [key, text]) => total + key.length + text.length, 0);

/** The value as JSON, refusing what JSON would silently drop or cannot hold. */
function serialized(value: unknown): string {
  const text = JSON.stringify(value) as string | undefined;
  if (text === undefined) {
    throw new Error('The value cannot be stored as JSON.');
  }
  return text;
}

/**
 * The store of plugin `id`, kept in `<folder>/<id>.json`. The ID comes from
 * YapYap, never from the plugin, and the manifest schema allows only
 * reverse-DNS names, so it is always one plain file name.
 */
export function keyValueStore(folder: string, id: string): KeyValueStore {
  const path = join(folder, `${id}.json`);
  let cached: Map<string, string> | undefined;
  const current = (): Map<string, string> => (cached ??= load(path));
  const save = (entries: Map<string, string>): void => {
    mkdirSync(folder, { recursive: true, mode: OWNER_ONLY_FOLDER });
    const text = JSON.stringify({ version: FILE_VERSION, entries: Object.fromEntries(entries) });
    writeTextAtomically(path, text, OWNER_ONLY);
    cached = entries;
  };
  return {
    get: (key) => {
      const text = current().get(key);
      return text === undefined ? undefined : (JSON.parse(text) as unknown);
    },
    set: (key, value) => {
      const entries = new Map(current()).set(key, serialized(value));
      if (sizeOf(entries) > STORE_LIMIT) {
        return false;
      }
      save(entries);
      return true;
    },
    delete: (key) => {
      const entries = new Map(current());
      if (entries.delete(key)) {
        save(entries);
      }
    },
  };
}
