import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSecretStore, secretFileAt } from './secret-store.ts';

/** Reversible stand-in for the keychain; real encryption is the system's job. */
function encryption(available = true, backend = 'gnome_libsecret') {
  const keychain = {
    available,
    rotated: false,
    getSelectedStorageBackend: () => backend,
    isAsyncEncryptionAvailable: () => Promise.resolve(keychain.available),
    encryptStringAsync: vi.fn((plainText: string) =>
      Promise.resolve(Buffer.from(`sealed:${plainText}`)),
    ),
    decryptStringAsync: (encrypted: Buffer) => {
      const text = encrypted.toString();
      if (!text.startsWith('sealed:')) {
        return Promise.reject(new Error('Wrong key.'));
      }
      return Promise.resolve({
        result: text.slice('sealed:'.length),
        shouldReEncrypt: keychain.rotated,
      });
    },
  };
  return keychain;
}

function memoryFile(initial?: string) {
  const file = {
    text: initial,
    read: () => file.text,
    write: (text: string) => (file.text = text),
  };
  return file;
}

describe('openSecretStore', () => {
  it('keeps a secret encrypted, reads it back, and forgets it', async () => {
    const file = memoryFile();
    const store = openSecretStore(file, encryption(), 'linux');
    expect(await store.canKeep()).toBe(true);
    expect(await store.set('proxy', 'hunter2')).toBe(true);
    expect(file.text).not.toContain('hunter2');
    expect(await openSecretStore(file, encryption(), 'darwin').get('proxy')).toBe('hunter2');
    expect(await store.set('proxy', undefined)).toBe(true);
    expect(await store.get('proxy')).toBeUndefined();
    expect(file.text).toBe('{"version":1,"secrets":{}}');
  });

  it('forgets every secret under a prefix at once, and writes nothing when none matches', async () => {
    const file = memoryFile();
    const store = openSecretStore(file, encryption(), 'linux');
    await store.set('org.example.hello/key', 'a');
    await store.set('org.example.hello/token', 'b');
    await store.set('org.example.other/key', 'c');
    store.forgetAll('org.example.hello/');
    const again = openSecretStore(file, encryption(), 'linux');
    expect(await again.get('org.example.hello/key')).toBeUndefined();
    expect(await again.get('org.example.hello/token')).toBeUndefined();
    expect(await again.get('org.example.other/key')).toBe('c');
    const write = vi.spyOn(file, 'write');
    store.forgetAll('org.example.missing/');
    expect(write).not.toHaveBeenCalled();
  });

  it('stores a secret again when the system rotated its key', async () => {
    const file = memoryFile();
    const keychain = encryption();
    const store = openSecretStore(file, keychain, 'win32');
    await store.set('proxy', 'hunter2');
    keychain.rotated = true;
    expect(await store.get('proxy')).toBe('hunter2');
    expect(keychain.encryptStringAsync).toHaveBeenCalledTimes(2);
    keychain.rotated = false;
    expect(await store.get('proxy')).toBe('hunter2');
    expect(keychain.encryptStringAsync).toHaveBeenCalledTimes(2);
  });

  it('keeps nothing without real encryption, but can still forget', async () => {
    const file = memoryFile();
    expect(
      await openSecretStore(file, encryption(true, 'basic_text'), 'linux').set('proxy', 'x'),
    ).toBe(false);
    const store = openSecretStore(file, encryption(false), 'darwin');
    expect(await store.canKeep()).toBe(false);
    expect(await store.set('proxy', 'x')).toBe(false);
    expect(file.text).toBeUndefined();
    expect(await store.set('proxy', undefined)).toBe(true);
  });

  it('gives nothing back once the system can no longer decrypt', async () => {
    const file = memoryFile();
    const keychain = encryption();
    const store = openSecretStore(file, keychain, 'darwin');
    await store.set('proxy', 'hunter2');
    keychain.available = false;
    expect(await store.get('proxy')).toBeUndefined();
    const replaced = memoryFile(
      JSON.stringify({ version: 1, secrets: { proxy: Buffer.from('other').toString('base64') } }),
    );
    expect(await openSecretStore(replaced, encryption(), 'darwin').get('proxy')).toBeUndefined();
  });

  it('starts empty from a missing, broken or foreign file', async () => {
    for (const text of [
      undefined,
      '{',
      'null',
      '{"version":2,"secrets":{"a":"b"}}',
      '{"version":1}',
    ]) {
      expect(
        await openSecretStore(memoryFile(text), encryption(), 'darwin').get('a'),
      ).toBeUndefined();
    }
    const mixed = memoryFile(
      JSON.stringify({
        version: 1,
        secrets: { a: 42, b: Buffer.from('sealed:ok').toString('base64') },
      }),
    );
    const store = openSecretStore(mixed, encryption(), 'darwin');
    expect([await store.get('a'), await store.get('b')]).toEqual([undefined, 'ok']);
  });
});

describe('secretFileAt', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads nothing before the file exists, and writes it for the user alone', () => {
    dir = mkdtempSync(join(tmpdir(), 'yapyap-secrets-'));
    const path = join(dir, 'secrets.json');
    const file = secretFileAt(path);
    expect(file.read()).toBeUndefined();
    file.write('{}');
    expect(file.read()).toBe('{}');
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    writeFileSync(path, 'x');
    expect(file.read()).toBe('x');
  });
});
