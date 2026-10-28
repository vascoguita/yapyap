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
