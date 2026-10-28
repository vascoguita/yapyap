import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digestFiles, MANIFEST } from './files.ts';
import { readPrivateKey, fingerprint } from './keys.ts';
import { signManifest, verifyManifest, type Manifest, type Verification } from './signature.ts';
import { createPublicKey } from 'node:crypto';
import { zipSync } from 'fflate';

function readManifest(root: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  } catch {
    throw new Error(`No readable ${MANIFEST} in ${root}.`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${MANIFEST} must hold a JSON object.`);
  }
  return value as Manifest;
}

/** Signs an unpacked extension in place, rewriting its manifest; returns the key's fingerprint. */
export function signExtensionFolder(root: string, privateKeyPem: string): string {
  const key = readPrivateKey(privateKeyPem);
  const signed = signManifest(readManifest(root), digestFiles(root), key);
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(signed, null, 2)}\n`);
  return fingerprint(createPublicKey(key));
}

/** Checks an unpacked extension's signature against its manifest and files. */
export function verifyExtensionFolder(root: string): Verification {
  return verifyManifest(readManifest(root), digestFiles(root));
}

/**
 * Packs a signed extension folder into the `.yapyap-extension` archive users
 * install. A folder whose signature does not verify is refused, so an
 * archive never leaves an author's machine broken.
 */
export function packExtensionFolder(root: string): Uint8Array {
  const verification = verifyExtensionFolder(root);
  if (!verification.valid) {
    throw new Error(`The extension's signature does not verify: ${verification.reason}`);
  }
  const files = digestFiles(root).map(([path]) => [path, readFileSync(join(root, path))] as const);
  return zipSync(Object.fromEntries([[MANIFEST, readFileSync(join(root, MANIFEST))], ...files]));
}
