import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256 = /^sha256-([A-Za-z0-9+/]{43}=)$/;

/**
 * Whether `bytes` match a Subresource-Integrity-style `sha256-<base64>`
 * value, which an extension installed from a URL must carry (ADR 0004). Any
 * other algorithm or form fails.
 */
export function matchesIntegrity(bytes: Uint8Array, integrity: string): boolean {
  const expected = SHA256.exec(integrity)?.[1];
  if (expected === undefined) {
    return false;
  }
  const actual = createHash('sha256').update(bytes).digest();
  return timingSafeEqual(actual, Buffer.from(expected, 'base64'));
}
