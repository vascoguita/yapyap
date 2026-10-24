import { readFileSync } from 'node:fs';
import { writeTextAtomically } from '../atomic-write.ts';

/** Electron's `safeStorage`, as far as YapYap uses it. */
export interface EncryptionPort {
  isEncryptionAvailable(): boolean;
  /** Linux only. */
  getSelectedStorageBackend(): string;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** The secrets file; only ever holds ciphertext. */
export interface SecretFile {
  readonly read: () => string | undefined;
  readonly write: (text: string) => void;
}

export interface SecretStore {
  /** False where the system offers no real encryption, so nothing may be kept. */
  readonly canKeep: () => boolean;
  readonly get: (name: string) => string | undefined;
  /** Keeps a secret, or forgets it when `value` is undefined; false if it cannot be kept. */
  readonly set: (name: string, value: string | undefined) => boolean;
}

const FILE_VERSION = 1;

/** Read and write for the user alone. */
const OWNER_ONLY = 0o600;

/** The secrets file at `path`, readable and writable by the user alone. */
export function secretFileAt(path: string): SecretFile {
  return {
    read: () => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    write: (text) => {
      writeTextAtomically(path, text, OWNER_ONLY);
    },
  };
}

/**
 * Linux backends that only obfuscate: without a keyring, Chromium falls
 * back to a key anyone who can read the profile also has.
 */
const WEAK_BACKENDS = new Set(['basic_text', 'unknown']);

function parse(text: string | undefined): Map<string, string> {
  try {
    const parsed = JSON.parse(text ?? '{}') as { version?: unknown; secrets?: unknown };
    const secrets = parsed.version === FILE_VERSION ? parsed.secrets : undefined;
    if (typeof secrets !== 'object' || secrets === null) {
      return new Map();
    }
    return new Map(
      Object.entries(secrets).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return new Map();
  }
}

/**
 * Keeps secrets such as proxy passwords encrypted by the system's keychain
 * through `safeStorage`, never in the settings and never in plain text.
 */
export function openSecretStore(
  file: SecretFile,
  encryption: EncryptionPort,
  platform: string,
): SecretStore {
  const backend = (): string =>
    platform === 'linux' ? encryption.getSelectedStorageBackend() : 'system';
  const secrets = parse(file.read());
  const save = (): void => {
    file.write(JSON.stringify({ version: FILE_VERSION, secrets: Object.fromEntries(secrets) }));
  };
  const canKeep = (): boolean =>
    encryption.isEncryptionAvailable() && !WEAK_BACKENDS.has(backend());
  return {
    canKeep,
    get: (name) => {
      const stored = secrets.get(name);
      if (stored === undefined || !encryption.isEncryptionAvailable()) {
        return undefined;
      }
      try {
        return encryption.decryptString(Buffer.from(stored, 'base64'));
      } catch {
        // Encrypted under a key the system no longer has; asking again is all that is left.
        return undefined;
      }
    },
    set: (name, value) => {
      if (value === undefined) {
        secrets.delete(name);
      } else if (canKeep()) {
        secrets.set(name, encryption.encryptString(value).toString('base64'));
      } else {
        return false;
      }
      save();
      return true;
    },
  };
}
