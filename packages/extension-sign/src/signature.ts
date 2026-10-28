import { sign, verify, type KeyObject } from 'node:crypto';
import { canonicalJson, compareCodeUnits } from './canonical.ts';
import type { FileDigest } from './files.ts';
import { fingerprint, publicKeyOf, readPublicKey } from './keys.ts';

export type Manifest = Readonly<Record<string, unknown>>;

interface ExtensionSignature {
  readonly publicKey: string;
  readonly algorithm: 'ed25519';
  readonly value: string;
}

export type Verification =
  | { readonly valid: true; readonly fingerprint: string }
  | { readonly valid: false; readonly reason: string };

/** The bytes a signature covers: the manifest without its signature, and every file's digest. */
export function signingPayload(manifest: Manifest, files: readonly FileDigest[]): Buffer {
  const unsigned = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'signature'),
  );
  const sorted = [...files].sort(([a], [b]) => compareCodeUnits(a, b));
  return Buffer.from(canonicalJson({ manifest: unsigned, files: sorted }));
}

/** The manifest with a signature over itself and `files`, replacing any old one. */
export function signManifest(
  manifest: Manifest,
  files: readonly FileDigest[],
  privateKey: KeyObject,
): Manifest {
  const signature: ExtensionSignature = {
    publicKey: publicKeyOf(privateKey),
    algorithm: 'ed25519',
    value: sign(null, signingPayload(manifest, files), privateKey).toString('base64'),
  };
  return { ...manifest, signature };
}

function readSignature(manifest: Manifest): ExtensionSignature | undefined {
  const { publicKey, algorithm, value } = Object(manifest['signature']) as Record<string, unknown>;
  return typeof publicKey === 'string' && algorithm === 'ed25519' && typeof value === 'string'
    ? { publicKey, algorithm, value }
    : undefined;
}

/** Checks a manifest's signature against the files that came with it. */
export function verifyManifest(manifest: Manifest, files: readonly FileDigest[]): Verification {
  const signature = readSignature(manifest);
  if (signature === undefined) {
    return { valid: false, reason: 'The extension is not signed.' };
  }
  const key = readPublicKey(signature.publicKey);
  if (key === undefined) {
    return { valid: false, reason: 'The signing key is not an Ed25519 public key.' };
  }
  const signed = verify(
    null,
    signingPayload(manifest, files),
    key,
    Buffer.from(signature.value, 'base64'),
  );
  return signed
    ? { valid: true, fingerprint: fingerprint(key) }
    : { valid: false, reason: 'The signature does not match the extension’s files and manifest.' };
}
