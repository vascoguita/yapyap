import { createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Signs the plugin marketplace's index (ADR 0014): an Ed25519 signature,
 * as base64, over the file's exact bytes, so nothing is canonicalized and
 * the bytes YapYap checks are the bytes it parses.
 */
export function signIndex(bytes: Uint8Array, privateKey: KeyObject): string {
  return sign(null, bytes, privateKey).toString('base64');
}

/**
 * Whether one of the first-party trust anchors (SPKI PEM) signed `bytes`.
 * Only those keys may vouch for the marketplace; a malformed signature is
 * simply not valid.
 */
export function verifyIndex(
  bytes: Uint8Array,
  signature: string,
  anchors: readonly string[],
): boolean {
  const value = Buffer.from(signature.trim(), 'base64');
  return anchors.some((pem) => {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === 'ed25519' && verify(null, bytes, key, value);
  });
}
