import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { fingerprint, signingPayload, type ExtensionArchive } from '@yapyap/extension-sign';
import { strToU8, zipSync } from 'fflate';

/** A well-formed key fingerprint that matches no real key. */
export const FAKE_FINGERPRINT = Array.from({ length: 32 }, () => 'ab').join(':');

/** A throwaway Ed25519 key, generated per test run and kept in memory only (ADR 0005). */
export interface TestKey {
  readonly privateKey: KeyObject;
  readonly publicKey: string;
  readonly fingerprint: string;
}

export function testKey(): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey: createPublicKey(privateKey)
      .export({ format: 'der', type: 'spki' })
      .toString('base64'),
    fingerprint: fingerprint(publicKey),
  };
}

export type TestManifest = Record<string, unknown>;

export function testManifest(overrides: TestManifest = {}): TestManifest {
  return {
    id: 'org.example.hello',
    name: 'Hello',
    version: '1.0.0',
    author: { name: 'Example Author', url: 'https://example.org/' },
    apiVersion: '^1.0.0',
    entry: 'main.js',
    capabilities: ['composer:insert-draft'],
    network: { hosts: ['api.example.org'] },
    ...overrides,
  };
}

/** An archive's files: text, or bytes for binaries such as a model engine's `.wasm`. */
export type TestFiles = Readonly<Record<string, string | Uint8Array>>;

const MAIN_FILES: TestFiles = { 'main.js': 'export {};' };

function toFiles(files: TestFiles): Map<string, Uint8Array> {
  return new Map(
    Object.entries(files).map(([path, data]) => [
      path,
      typeof data === 'string' ? strToU8(data) : data,
    ]),
  );
}

export function unsignedArchive(
  manifest: TestManifest = testManifest(),
  files: TestFiles = MAIN_FILES,
): ExtensionArchive {
  return { manifest, files: toFiles(files) };
}

export function signedArchive(
  key: TestKey,
  manifest: TestManifest = testManifest(),
  files: TestFiles = MAIN_FILES,
): ExtensionArchive {
  const bytes = toFiles(files);
  const digests = [...bytes].map(
    ([path, data]) => [path, createHash('sha256').update(data).digest('hex')] as const,
  );
  const value = sign(null, signingPayload(manifest, digests), key.privateKey).toString('base64');
  return {
    manifest: { ...manifest, signature: { publicKey: key.publicKey, algorithm: 'ed25519', value } },
    files: bytes,
  };
}

export function zipArchive(archive: ExtensionArchive): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(archive.manifest)),
    ...Object.fromEntries(archive.files),
  });
}
