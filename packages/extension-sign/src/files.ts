import { createHash } from 'node:crypto';
import { closeSync, constants, openSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A file's path inside the extension, with `/` separators, and its SHA-256 in hex. */
export type FileDigest = readonly [path: string, sha256: string];

/** The manifest carries the signature, so it is signed as data, not as a file. */
export const MANIFEST = 'manifest.json';

/**
 * Opening with O_NOFOLLOW fails on a link, so a file swapped for a link after
 * the folder was listed is never read through it. Windows has no such flag
 * (Node leaves it undefined there, whatever its types say); there the
 * listing's check is the only one.
 */
export function readFlags(noFollow: number | undefined): number {
  return constants.O_RDONLY | (noFollow ?? 0);
}

function digest(full: string): string {
  const fd = openSync(full, readFlags(constants.O_NOFOLLOW));
  try {
    return createHash('sha256').update(readFileSync(fd)).digest('hex');
  } finally {
    closeSync(fd);
  }
}

function walk(root: string, relative: string, digests: FileDigest[]): void {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    // The listing describes each entry itself, never what a link points to.
    if (entry.isSymbolicLink()) {
      throw new Error(`Extensions cannot contain symbolic links: ${path}`);
    }
    if (entry.isDirectory()) {
      walk(root, path, digests);
    } else {
      digests.push([path, digest(join(root, path))]);
    }
  }
}

/** Every file in an extension folder but the manifest, in no set order: signing sorts them. */
export function digestFiles(root: string): FileDigest[] {
  const digests: FileDigest[] = [];
  walk(root, '', digests);
  return digests.filter(([path]) => path !== MANIFEST);
}
