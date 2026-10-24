import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSettingChange, saveSetting, settingsOf } from './plugin-settings.ts';
import { loadRecords, saveRecords, type PluginRecord } from './records.ts';

const RECORD: PluginRecord = {
  id: 'org.example.hello',
  version: '1.0.0',
  fingerprint: null,
  firstParty: false,
  developer: true,
  capabilities: [],
  hosts: [],
};

const MANIFEST = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example' },
  apiVersion: '1.0.0',
  entry: 'main.js',
  capabilities: [],
  contributes: {
    settings: {
      type: 'object',
      properties: {
        model: { type: 'string', title: 'Model', enum: ['small', 'large'] },
        replies: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
};

let root = '';
const read = (path: string) => readFile(path);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-settings-'));
  await mkdir(join(root, RECORD.id, RECORD.version), { recursive: true });
  await writeFile(join(root, RECORD.id, RECORD.version, 'manifest.json'), JSON.stringify(MANIFEST));
  await saveRecords(root, new Map([[RECORD.id, RECORD]]));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const saved = async () => (await loadRecords(root)).get(RECORD.id)?.settings;

describe('settingsOf', () => {
  it('shows the form with what the user saved, and nothing for a plugin without one', async () => {
    expect(await settingsOf(root, { ...RECORD, settings: { model: 'large' } }, read)).toEqual([
      { key: 'model', type: 'string', title: 'Model', enum: ['small', 'large'], value: 'large' },
      { key: 'replies', type: 'integer', minimum: 1, maximum: 5 },
    ]);
    expect(await settingsOf(root, { ...RECORD, version: '9.9.9' }, read)).toEqual([]);
  });
});

describe('saveSetting', () => {
  it('saves a value that fits the form, and forgets one with null', async () => {
    const runtime = { regrant: vi.fn(() => Promise.resolve()) };
    await saveSetting(root, read, runtime, [RECORD.id, 'replies', 3]);
    await saveSetting(root, read, runtime, [RECORD.id, 'model', 'small']);
    expect(await saved()).toEqual({ replies: 3, model: 'small' });
    expect(runtime.regrant).toHaveBeenCalledWith(RECORD.id);
    await saveSetting(root, read, runtime, [RECORD.id, 'replies', null]);
    expect(await saved()).toEqual({ model: 'small' });
  });

  it('saves nothing that does not fit, nor for a plugin or field that is not there', async () => {
    const runtime = { regrant: vi.fn(() => Promise.resolve()) };
    await saveSetting(root, read, runtime, [RECORD.id, 'replies', 9]);
    await saveSetting(root, read, runtime, [RECORD.id, 'unknown', 'x']);
    await saveSetting(root, read, runtime, ['org.example.gone', 'model', 'small']);
    expect(await saved()).toBeUndefined();
    expect(runtime.regrant).not.toHaveBeenCalled();
  });
});

describe('isSettingChange', () => {
  it('takes a plugin, a key and a plain value or null, and nothing more', () => {
    expect(isSettingChange(['org.example.hello', 'model', 'small'])).toBe(true);
    expect(isSettingChange(['org.example.hello', 'replies', 2])).toBe(true);
    expect(isSettingChange(['org.example.hello', 'concise', false])).toBe(true);
    expect(isSettingChange(['org.example.hello', 'model', null])).toBe(true);
    expect(isSettingChange(['org.example.hello', 'model', { a: 1 }])).toBe(false);
    expect(isSettingChange(['org.example.hello', 7, 'x'])).toBe(false);
    expect(isSettingChange([7, 'model', 'x'])).toBe(false);
    expect(isSettingChange(['org.example.hello', 'model', 'x', 'more'])).toBe(false);
  });
});
