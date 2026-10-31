import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecords,
  readRecords,
  RECORDS_FILE,
  saveRecords,
  writeRecords,
  type ExtensionRecord,
} from './records.ts';

const FINGERPRINT = Array.from({ length: 32 }, () => '0f').join(':');

const SIGNED: ExtensionRecord = {
  id: 'org.example.signed',
  version: '1.2.0',
  fingerprint: FINGERPRINT,
  firstParty: false,
  developer: false,
  capabilities: ['composer:insert-draft'],
  hosts: ['api.example.org'],
};

const UNSIGNED: ExtensionRecord = {
  ...SIGNED,
  id: 'org.example.unsigned',
  fingerprint: null,
  developer: true,
};

function fileWith(extensions: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, extensions });
}

describe('readRecords and writeRecords', () => {
  it('round-trips records, sorted by ID', () => {
    const text = writeRecords(
      new Map([
        [UNSIGNED.id, UNSIGNED],
        [SIGNED.id, SIGNED],
      ]),
    );
    expect(text.indexOf(SIGNED.id)).toBeLessThan(text.indexOf(UNSIGNED.id));
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ version: 1 });
    expect(readRecords(text)).toEqual(
      new Map([
        [SIGNED.id, SIGNED],
        [UNSIGNED.id, UNSIGNED],
      ]),
    );
  });

  it('treats a file that is not JSON, or has no extensions, as empty', () => {
    expect(readRecords('{')).toEqual(new Map());
    expect(readRecords('null')).toEqual(new Map());
    expect(readRecords('{"version":1}')).toEqual(new Map());
  });

  it('drops malformed records and keeps the rest', () => {
    const records = readRecords(
      fileWith({
        [SIGNED.id]: SIGNED,
        'org.example.other': SIGNED,
        'org.example.bad-key': { ...SIGNED, id: 'org.example.bad-key', fingerprint: 'abc' },
        'org.example.extra': { ...SIGNED, id: 'org.example.extra', extra: true },
        'org.example.claims-signed': {
          ...UNSIGNED,
          id: 'org.example.claims-signed',
          developer: false,
        },
        'org.example.claims-unsigned': {
          ...SIGNED,
          id: 'org.example.claims-unsigned',
          developer: true,
        },
      }),
    );
    expect([...records.keys()]).toEqual([SIGNED.id]);
  });

  it('bounds what a record may hold, so a tampered file cannot grow without limit', () => {
    const account = '0123abcd-0123-4abc-8def-0123456789ab';
    const accounts = (count: number) =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `${i.toString(16).padStart(8, '0')}-0123-4abc-8def-0123456789ab`,
          [],
        ]),
      );
    const settings = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`key${String(i)}`, true]));
    const keeps = (extra: Partial<Record<string, unknown>>) =>
      readRecords(fileWith({ [SIGNED.id]: { ...SIGNED, ...extra } })).size === 1;
    expect(keeps({ revoked: ['a'.repeat(300)] })).toBe(true);
    expect(keeps({ revoked: ['a'.repeat(301)] })).toBe(false);
    expect(keeps({ revoked: Array.from({ length: 64 }, (_, i) => String(i)) })).toBe(true);
    expect(keeps({ revoked: Array.from({ length: 65 }, (_, i) => String(i)) })).toBe(false);
    expect(keeps({ revoked: ['a', 'a'] })).toBe(false);
    expect(keeps({ settings: { ['k'.repeat(64)]: 'v'.repeat(1000) } })).toBe(true);
    expect(keeps({ settings: { ['k'.repeat(65)]: 'v' } })).toBe(false);
    expect(keeps({ settings: { k: 'v'.repeat(1001) } })).toBe(false);
    expect(keeps({ settings: settings(32) })).toBe(true);
    expect(keeps({ settings: settings(33) })).toBe(false);
    expect(keeps({ pulled: 'p'.repeat(300) })).toBe(true);
    expect(keeps({ pulled: '' })).toBe(false);
    expect(keeps({ pulled: 'p'.repeat(301) })).toBe(false);
    expect(keeps({ revokedIn: { [account]: ['composer:insert-draft'] } })).toBe(true);
    expect(keeps({ revokedIn: { 'not-an-account': [] } })).toBe(false);
    expect(keeps({ revokedIn: accounts(32) })).toBe(true);
    expect(keeps({ revokedIn: accounts(33) })).toBe(false);
    const servers = (count: number) =>
      Array.from({ length: count }, (_, i) => `localhost:${String(1000 + i)}`);
    expect(keeps({ localServers: ['localhost:11434', '127.0.0.1:80', '[::1]:65535'] })).toBe(true);
    expect(keeps({ localServers: servers(8) })).toBe(true);
    expect(keeps({ localServers: servers(9) })).toBe(false);
    expect(keeps({ localServers: ['localhost:11434', 'localhost:11434'] })).toBe(false);
    for (const server of ['192.168.1.10:11434', 'localhost', 'localhost:123456', 'xlocalhost:1']) {
      expect(keeps({ localServers: [server] })).toBe(false);
    }
    expect(keeps({ modelSearch: true })).toBe(true);
    expect(keeps({ modelSearch: false })).toBe(true);
    expect(keeps({ modelSearch: 'yes' })).toBe(false);
  });
});

describe('loadRecords and saveRecords', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yapyap-records-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('loads nothing before anything is saved', async () => {
    await expect(loadRecords(root)).resolves.toEqual(new Map());
  });

  it('saves the records and loads them back, leaving no temporary file', async () => {
    const records = new Map([[SIGNED.id, SIGNED]]);
    await saveRecords(root, records);
    await expect(loadRecords(root)).resolves.toEqual(records);
    await expect(readdir(root)).resolves.toEqual([RECORDS_FILE]);
    await saveRecords(root, new Map());
    await expect(readFile(join(root, RECORDS_FILE), 'utf8')).resolves.toBe(writeRecords(new Map()));
  });

  it('treats a damaged file as empty', async () => {
    await writeFile(join(root, RECORDS_FILE), 'not json');
    await expect(loadRecords(root)).resolves.toEqual(new Map());
  });

  it('does not hide errors other than a missing file', async () => {
    await mkdir(join(root, RECORDS_FILE));
    await expect(loadRecords(root)).rejects.toThrow();
  });

  it('removes its temporary file when the save fails', async () => {
    await mkdir(join(root, RECORDS_FILE));
    await writeFile(join(root, RECORDS_FILE, 'keep'), '');
    await expect(saveRecords(root, new Map())).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([RECORDS_FILE]);
  });

  it('fails without leaving anything when the folder does not exist', async () => {
    await expect(saveRecords(join(root, 'missing'), new Map())).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([]);
  });
});
