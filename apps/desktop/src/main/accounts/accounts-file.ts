import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomically } from '../atomic-write.ts';
import {
  accountIdsInPartitions,
  parseAccounts,
  serializeAccounts,
  type Accounts,
} from './accounts.ts';

export const ACCOUNTS_FILE = 'accounts.json';
/** Where Electron keeps each persistent partition's data. */
const PARTITIONS_FOLDER = 'Partitions';

function readOptional<T>(path: string, read: (path: string) => T, fallback: T): T {
  return existsSync(path) ? read(path) : fallback;
}

/**
 * Loads the accounts from `userData`, and saves them back when they had to
 * be created or rebuilt, so the file always describes the sessions in use.
 */
export function loadAccounts(userData: string, newId: () => string = randomUUID): Accounts {
  const path = join(userData, ACCOUNTS_FILE);
  const text = readOptional(path, (file) => readFileSync(file, 'utf8'), undefined);
  const folders = readOptional<string[]>(
    join(userData, PARTITIONS_FOLDER),
    (dir) => readdirSync(dir),
    [],
  );
  const accounts = parseAccounts(text, accountIdsInPartitions(folders), newId);
  const serialized = serializeAccounts(accounts);
  if (serialized !== text) {
    writeTextAtomically(path, serialized);
  }
  return accounts;
}
