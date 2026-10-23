import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ACCOUNTS_FILE, loadAccounts } from './accounts-file.ts';
import { serializeAccounts } from './accounts.ts';

const A = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const C = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';
const dirs: string[] = [];

function profile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yapyap-accounts-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadAccounts', () => {
  it('creates and saves the first account in a new profile', () => {
    const dir = profile();
    const accounts = loadAccounts(dir, () => C);
    expect(accounts.active).toBe(C);
    expect(readFileSync(join(dir, ACCOUNTS_FILE), 'utf8')).toBe(serializeAccounts(accounts));
  });

  it('rebuilds a damaged file from the sessions Electron keeps', () => {
    const dir = profile();
    mkdirSync(join(dir, 'Partitions', `account-${A}`), { recursive: true });
    writeFileSync(join(dir, ACCOUNTS_FILE), 'not json');
    expect(loadAccounts(dir, () => C).accounts.map((account) => account.id)).toEqual([A]);
    expect(readFileSync(join(dir, ACCOUNTS_FILE), 'utf8')).toContain(A);
  });

  it('leaves a valid file untouched', () => {
    const dir = profile();
    const accounts = loadAccounts(dir, () => C);
    const file = join(dir, ACCOUNTS_FILE);
    const written = statSync(file).mtimeMs;
    expect(loadAccounts(dir, () => A)).toEqual(accounts);
    expect(statSync(file).mtimeMs).toBe(written);
  });
});
