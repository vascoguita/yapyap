import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signIndex, verifyIndex } from './index-signature.ts';

const pair = () => generateKeyPairSync('ed25519');
const pem = (key: ReturnType<typeof pair>['publicKey']) =>
  key.export({ format: 'pem', type: 'spki' });

describe('index signatures', () => {
  const anchor = pair();
  const other = pair();
  const bytes = new TextEncoder().encode('{"format":1}');

  it('verifies an index signed by any trust anchor, over its exact bytes', () => {
    const signature = signIndex(bytes, anchor.privateKey);
    expect(verifyIndex(bytes, signature, [pem(other.publicKey), pem(anchor.publicKey)])).toBe(true);
    expect(verifyIndex(bytes, `${signature}\n`, [pem(anchor.publicKey)])).toBe(true);
  });

  it('refuses another key, changed bytes and a malformed signature', () => {
    const signature = signIndex(bytes, other.privateKey);
    expect(verifyIndex(bytes, signature, [pem(anchor.publicKey)])).toBe(false);
    const own = signIndex(bytes, anchor.privateKey);
    const changed = new TextEncoder().encode('{"format":1} ');
    expect(verifyIndex(changed, own, [pem(anchor.publicKey)])).toBe(false);
    expect(verifyIndex(bytes, 'not base64!', [pem(anchor.publicKey)])).toBe(false);
    expect(verifyIndex(bytes, own, [])).toBe(false);
  });

  it('never accepts a key of another kind as an anchor', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signature = signIndex(bytes, anchor.privateKey);
    expect(verifyIndex(bytes, signature, [pem(rsa.publicKey)])).toBe(false);
  });
});
