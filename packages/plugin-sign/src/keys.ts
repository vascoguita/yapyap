import { createHash, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

const RAW_KEY_BYTES = 32;

/**
 * Reads an Ed25519 private key from PKCS#8 PEM. Errors never repeat the
 * input, so a mistyped command cannot echo key material.
 */
export function readPrivateKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: pem, format: 'pem' });
  } catch {
    throw new Error('The private key is not a PKCS#8 PEM key.');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('The private key is not an Ed25519 key.');
  }
  return key;
}

/** The public half as base64 SPKI DER, the form a manifest carries. */
export function publicKeyOf(privateKey: KeyObject): string {
  return createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
}

/** Reads a manifest's base64 SPKI DER public key; undefined unless it is Ed25519. */
export function readPublicKey(spkiBase64: string): KeyObject | undefined {
  try {
    const key = createPublicKey({
      key: Buffer.from(spkiBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return key.asymmetricKeyType === 'ed25519' ? key : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The SHA-256 of the raw 32-byte public key, as colon-separated hex pairs:
 * what users compare when they pin a third-party author's key (ADR 0004).
 */
export function fingerprint(publicKey: KeyObject): string {
  // An Ed25519 SPKI ends with the raw 32-byte key.
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-RAW_KEY_BYTES);
  return [...createHash('sha256').update(raw).digest()]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
}
