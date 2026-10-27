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
 * Only those keys may vouch for the marketplace. A malformed signature, or
 * an anchor that is not an Ed25519 key, is simply not valid: base64
 * decoding skips whitespace and Ed25519 signatures verify under no other
 * key type.
 */
export function verifyIndex(
  bytes: Uint8Array,
  signature: string,
  anchors: readonly string[],
): boolean {
  const value = Buffer.from(signature, 'base64');
  return anchors.some((pem) => verify(null, bytes, createPublicKey(pem), value));
}
