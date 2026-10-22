import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digestFiles, MANIFEST } from './files.ts';
import { readPrivateKey, fingerprint } from './keys.ts';
import { signManifest, verifyManifest, type Manifest, type Verification } from './signature.ts';
import { createPublicKey } from 'node:crypto';

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

/** Signs an unpacked plugin in place, rewriting its manifest; returns the key's fingerprint. */
export function signPluginFolder(root: string, privateKeyPem: string): string {
  const key = readPrivateKey(privateKeyPem);
  const signed = signManifest(readManifest(root), digestFiles(root), key);
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(signed, null, 2)}\n`);
  return fingerprint(createPublicKey(key));
}

/** Checks an unpacked plugin's signature against its manifest and files. */
export function verifyPluginFolder(root: string): Verification {
  return verifyManifest(readManifest(root), digestFiles(root));
}
