import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprint, publicKeyOf, readPrivateKey, readPublicKey } from './keys.ts';

// A throwaway key per test run, kept in memory only (ADR 0005).
const { privateKey } = generateKeyPairSync('ed25519');
const PEM = privateKey.export({ format: 'pem', type: 'pkcs8' });

describe('readPrivateKey', () => {
  it('reads an Ed25519 PKCS#8 PEM key', () => {
    expect(readPrivateKey(PEM).asymmetricKeyType).toBe('ed25519');
  });

  it('refuses another algorithm', () => {
    const ed448 = generateKeyPairSync('ed448').privateKey.export({ format: 'pem', type: 'pkcs8' });
    expect(() => readPrivateKey(ed448)).toThrow('The private key is not an Ed25519 key.');
  });

  it('refuses text that is not a key, without repeating it', () => {
    expect(() => readPrivateKey('-----BEGIN PRIVATE KEY-----\nsecret\n')).toThrow(
      /^The private key is not a PKCS#8 PEM key\.$/,
    );
  });
});

describe('public keys', () => {
  it('round-trips the public half through base64 SPKI DER', () => {
    const spki = publicKeyOf(readPrivateKey(PEM));
    expect(Buffer.from(spki, 'base64')).toHaveLength(44);
    expect(readPublicKey(spki)?.equals(createPublicKey(privateKey))).toBe(true);
  });

  it.each(['', 'bm90IGEga2V5', publicKeyOf(generateKeyPairSync('ed448').privateKey)])(
    'reads %j as no Ed25519 key',
    (spki) => {
      expect(readPublicKey(spki)).toBeUndefined();
    },
  );
});

describe('fingerprint', () => {
  it('is the SHA-256 of the raw key as 32 colon-separated hex pairs', () => {
    const key = createPublicKey(privateKey);
    const value = fingerprint(key);
    expect(value).toMatch(/^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$/);
    expect(fingerprint(key)).toBe(value);
    // Computed independently, from the raw key in the JWK form.
    const raw = Buffer.from(key.export({ format: 'jwk' }).x ?? '', 'base64url');
    const expected = createHash('sha256').update(raw).digest('hex').match(/../g)?.join(':');
    expect(value).toBe(expected);
    expect(fingerprint(createPublicKey(generateKeyPairSync('ed25519').privateKey))).not.toBe(value);
  });
});
