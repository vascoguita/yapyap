import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FileDigest } from './files.ts';
import { readPrivateKey } from './keys.ts';
import { signingPayload, signManifest, verifyManifest } from './signature.ts';

// A throwaway key per test run, kept in memory only (ADR 0005).
const pem = (): string =>
  generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
const KEY = readPrivateKey(pem());

const MANIFEST = { id: 'org.example.hello', name: 'Hello', version: '1.0.0' };
const FILES: FileDigest[] = [
  ['main.js', 'a'.repeat(64)],
  ['assets/icon.svg', 'b'.repeat(64)],
];

describe('signingPayload', () => {
  it('covers the manifest without its signature and the files sorted by path', () => {
    expect(signingPayload({ ...MANIFEST, signature: { value: 'x' } }, FILES).toString('utf8')).toBe(
      `{"files":[["assets/icon.svg","${'b'.repeat(64)}"],["main.js","${'a'.repeat(64)}"]],"manifest":{"id":"org.example.hello","name":"Hello","version":"1.0.0"}}`,
    );
  });
});

describe('signManifest and verifyManifest', () => {
  const signed = signManifest(MANIFEST, FILES, KEY);

  it('adds an Ed25519 signature that verifies, naming the key by fingerprint', () => {
    expect(signed['signature']).toEqual({
      publicKey: expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/) as unknown,
      algorithm: 'ed25519',
      value: expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/) as unknown,
    });
    expect(verifyManifest(signed, FILES)).toEqual({
      valid: true,
      fingerprint: expect.stringMatching(/^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$/) as unknown,
    });
  });

  it('replaces an old signature', () => {
    const again = signManifest(signed, FILES, readPrivateKey(pem()));
    expect(verifyManifest(again, FILES).valid).toBe(true);
    expect(again['signature']).not.toEqual(signed['signature']);
  });

  it.each([
    ['a changed file', FILES.map(([path]) => [path, 'c'.repeat(64)] as const)],
    ['an extra file', [...FILES, ['extra.js', 'd'.repeat(64)] as const]],
    ['a missing file', FILES.slice(1)],
  ])('fails for %s', (_, files) => {
    expect(verifyManifest(signed, files)).toEqual({
      valid: false,
      reason: 'The signature does not match the plugin’s files and manifest.',
    });
  });

  it('fails for a changed manifest or a swapped key', () => {
    expect(verifyManifest({ ...signed, version: '9.9.9' }, FILES).valid).toBe(false);
    const other = signManifest(MANIFEST, FILES, readPrivateKey(pem()));
    const swapped = {
      ...signed,
      signature: {
        ...(signed['signature'] as object),
        publicKey: (other['signature'] as { publicKey: string }).publicKey,
      },
    };
    expect(verifyManifest(swapped, FILES).valid).toBe(false);
  });

  it.each([
    [{}],
    [{ signature: 'x' }],
    [{ signature: { publicKey: 'k', algorithm: 'rsa', value: 'v' } }],
    [{ signature: { publicKey: 1, algorithm: 'ed25519', value: 'v' } }],
    [{ signature: { publicKey: 'k', algorithm: 'ed25519', value: 2 } }],
  ])('treats %j as unsigned', (extra) => {
    expect(verifyManifest({ ...MANIFEST, ...extra }, FILES)).toEqual({
      valid: false,
      reason: 'The plugin is not signed.',
    });
  });

  it('refuses a key that is not Ed25519', () => {
    const manifest = {
      ...MANIFEST,
      signature: { publicKey: 'bm9wZQ==', algorithm: 'ed25519', value: 'eA==' },
    };
    expect(verifyManifest(manifest, FILES)).toEqual({
      valid: false,
      reason: 'The signing key is not an Ed25519 public key.',
    });
  });
});
