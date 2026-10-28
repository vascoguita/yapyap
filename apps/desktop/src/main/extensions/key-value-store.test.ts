import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyValueStore, removeStore, STORE_LIMIT } from './key-value-store.ts';

let root = '';
let folder = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-kv-'));
  folder = join(root, '.storage');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('keyValueStore', () => {
  it('keeps JSON values across restarts, each extension in its own file', () => {
    const hello = keyValueStore(folder, 'org.example.hello');
    expect(hello.set('last', { chat: 'Team', unread: [1, 2] })).toBe(true);
    expect(hello.set('__proto__', 'plain')).toBe(true);
    keyValueStore(folder, 'org.example.other').set('last', 'other');
    const again = keyValueStore(folder, 'org.example.hello');
    expect(again.get('last')).toEqual({ chat: 'Team', unread: [1, 2] });
    expect(again.get('__proto__')).toBe('plain');
    expect(again.get('missing')).toBeUndefined();
    expect(keyValueStore(folder, 'org.example.other').get('last')).toBe('other');
  });

  it('forgets a deleted key, and writes nothing for one that is not there', async () => {
    const store = keyValueStore(folder, 'org.example.hello');
    store.delete('missing');
    await expect(stat(join(folder, 'org.example.hello.json'))).rejects.toThrow();
    store.set('a', 1);
    store.delete('a');
    expect(keyValueStore(folder, 'org.example.hello').get('a')).toBeUndefined();
  });

  it('refuses to grow past its limit, and keeps what it held', () => {
    const store = keyValueStore(folder, 'org.example.hello');
    expect(store.set('big', 'x'.repeat(STORE_LIMIT - 20))).toBe(true);
    expect(store.set('more', 'x'.repeat(100))).toBe(false);
    expect(store.get('more')).toBeUndefined();
    expect(store.set('big', 'small')).toBe(true);
    expect(store.set('more', 'x'.repeat(100))).toBe(true);
  });

  it('refuses a value JSON cannot hold', () => {
    const store = keyValueStore(folder, 'org.example.hello');
    expect(() => store.set('a', undefined)).toThrow('JSON');
    expect(() => store.set('a', () => 1)).toThrow('JSON');
    expect(() => store.set('a', 1n)).toThrow();
  });

  it('starts empty from a missing, damaged or foreign file', async () => {
    const path = join(folder, 'org.example.hello.json');
    keyValueStore(folder, 'org.example.hello').set('a', 1);
    for (const text of ['not json', '{"version":2,"entries":{"a":"1"}}', '{"version":1}']) {
      await writeFile(path, text);
      expect(keyValueStore(folder, 'org.example.hello').get('a')).toBeUndefined();
    }
    await writeFile(path, '{"version":1,"entries":{"a":"1","b":2}}');
    const store = keyValueStore(folder, 'org.example.hello');
    expect([store.get('a'), store.get('b')]).toEqual([1, undefined]);
  });

  it.skipIf(process.platform === 'win32')('keeps the file readable by the user alone', async () => {
    keyValueStore(folder, 'org.example.hello').set('a', 1);
    const mode = (await stat(join(folder, 'org.example.hello.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.parse(await readFile(join(folder, 'org.example.hello.json'), 'utf8'))).toEqual({
      version: 1,
      entries: { a: '1' },
    });
  });
});

describe('removeStore', () => {
  it('deletes one extension’s store and no other, and copes with none', async () => {
    keyValueStore(folder, 'org.example.hello').set('a', 1);
    keyValueStore(folder, 'org.example.other').set('a', 2);
    await removeStore(folder, 'org.example.hello');
    await removeStore(folder, 'org.example.hello');
    await expect(stat(join(folder, 'org.example.hello.json'))).rejects.toThrow();
    expect(keyValueStore(folder, 'org.example.other').get('a')).toBe(2);
  });
});
