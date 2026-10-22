import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { fingerprint, signingPayload, type PluginArchive } from '@yapyap/plugin-sign';
import { strToU8, zipSync } from 'fflate';

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

const MAIN_FILES: Readonly<Record<string, string>> = { 'main.js': 'export {};' };

function toFiles(files: Readonly<Record<string, string>>): Map<string, Uint8Array> {
  return new Map(Object.entries(files).map(([path, text]) => [path, strToU8(text)]));
}

export function unsignedArchive(
  manifest: TestManifest = testManifest(),
  files: Readonly<Record<string, string>> = MAIN_FILES,
): PluginArchive {
  return { manifest, files: toFiles(files) };
}

export function signedArchive(
  key: TestKey,
  manifest: TestManifest = testManifest(),
  files: Readonly<Record<string, string>> = MAIN_FILES,
): PluginArchive {
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

export function zipArchive(archive: PluginArchive): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(archive.manifest)),
    ...Object.fromEntries(archive.files),
  });
}
