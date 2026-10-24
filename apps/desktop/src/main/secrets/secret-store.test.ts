import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSecretStore, secretFileAt } from './secret-store.ts';

/** Reversible stand-in for the keychain; real encryption is the system's job. */
function encryption(available = true, backend = 'gnome_libsecret') {
  return {
    available,
    getSelectedStorageBackend: () => backend,
    isEncryptionAvailable() {
      return this.available;
    },
    encryptString: (plainText: string) => Buffer.from(`sealed:${plainText}`),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString();
      if (!text.startsWith('sealed:')) {
        throw new Error('Wrong key.');
      }
      return text.slice('sealed:'.length);
    },
  };
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
  it('keeps a secret encrypted, reads it back, and forgets it', () => {
    const file = memoryFile();
    const store = openSecretStore(file, encryption(), 'linux');
    expect(store.canKeep()).toBe(true);
    expect(store.set('proxy', 'hunter2')).toBe(true);
    expect(file.text).not.toContain('hunter2');
    expect(openSecretStore(file, encryption(), 'darwin').get('proxy')).toBe('hunter2');
    expect(store.set('proxy', undefined)).toBe(true);
    expect(store.get('proxy')).toBeUndefined();
  });

  it('keeps nothing without real encryption, but can still forget', () => {
    const file = memoryFile();
    expect(openSecretStore(file, encryption(true, 'basic_text'), 'linux').set('proxy', 'x')).toBe(
      false,
    );
    const unavailable = encryption(false);
    const store = openSecretStore(file, unavailable, 'darwin');
    expect(store.canKeep()).toBe(false);
    expect(store.set('proxy', 'x')).toBe(false);
    expect(file.text).toBeUndefined();
    expect(store.set('proxy', undefined)).toBe(true);
  });

  it('gives nothing back once the system can no longer decrypt', () => {
    const file = memoryFile();
    const keychain = encryption();
    const store = openSecretStore(file, keychain, 'darwin');
    store.set('proxy', 'hunter2');
    keychain.available = false;
    expect(store.get('proxy')).toBeUndefined();
    const replaced = memoryFile(
      JSON.stringify({ version: 1, secrets: { proxy: Buffer.from('other').toString('base64') } }),
    );
    expect(openSecretStore(replaced, encryption(), 'darwin').get('proxy')).toBeUndefined();
  });

  it('starts empty from a missing, broken or foreign file', () => {
    for (const text of [
      undefined,
      '{',
      'null',
      '{"version":2,"secrets":{"a":"b"}}',
      '{"version":1}',
    ]) {
      expect(openSecretStore(memoryFile(text), encryption(), 'darwin').get('a')).toBeUndefined();
    }
    const mixed = memoryFile(
      JSON.stringify({
        version: 1,
        secrets: { a: 42, b: Buffer.from('sealed:ok').toString('base64') },
      }),
    );
    const store = openSecretStore(mixed, encryption(), 'darwin');
    expect([store.get('a'), store.get('b')]).toEqual([undefined, 'ok']);
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
