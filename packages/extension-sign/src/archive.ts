import { createHash } from 'node:crypto';
import { unzipSync, type UnzipFileInfo } from 'fflate';
import { MANIFEST, type FileDigest } from './files.ts';
import { verifyManifest, type Manifest, type Verification } from './signature.ts';

const MB = 1024 * 1024;

/** Bounds on a `.yapyap-extension` archive, so a hostile one cannot exhaust memory (ADR 0004). */
export interface ArchiveLimits {
  readonly archiveBytes: number;
  readonly entries: number;
  readonly fileBytes: number;
  readonly totalBytes: number;
}

const MAX_ARCHIVE_MB = 20;
const MAX_ENTRIES = 512;
const MAX_FILE_MB = 10;
const MAX_UNPACKED_MB = 50;

export const ARCHIVE_LIMITS: ArchiveLimits = {
  archiveBytes: MAX_ARCHIVE_MB * MB,
  entries: MAX_ENTRIES,
  fileBytes: MAX_FILE_MB * MB,
  totalBytes: MAX_UNPACKED_MB * MB,
};

/** An extension read entirely in memory; nothing reaches the disk before it verifies. */
export interface ExtensionArchive {
  readonly manifest: Manifest;
  /** Every file but the manifest, by its `/`-separated path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

const MAX_PATH_LENGTH = 200;
/** Backslashes, drive colons and control characters. */
const UNSAFE_CHARACTERS = /[\\:]|\p{Cc}/u;

/**
 * Accepts only plain relative paths: no absolute paths, drive letters,
 * backslashes, control characters, or `.`, `..` and empty segments, so no
 * entry can land outside the install folder once written.
 */
function checkPath(name: string): void {
  const segments = name.split('/');
  const unsafe =
    name.length > MAX_PATH_LENGTH ||
    UNSAFE_CHARACTERS.test(name) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..');
  if (unsafe) {
    throw new Error(
      `The extension archive has an unsafe path: ${JSON.stringify(name.slice(0, MAX_PATH_LENGTH))}`,
    );
  }
}

function admit(limits: ArchiveLimits): (info: UnzipFileInfo) => boolean {
  let entries = 0;
  let declared = 0;
  const seen = new Set<string>();
  return (info) => {
    entries += 1;
    if (entries > limits.entries) {
      throw new Error('The extension archive has too many entries.');
    }
    if (info.name.endsWith('/')) {
      return false;
    }
    checkPath(info.name);
    // Case-insensitive file systems would merge these into one file.
    const key = info.name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`The extension archive lists ${info.name} twice.`);
    }
    seen.add(key);
    declared += info.originalSize;
    if (info.originalSize > limits.fileBytes || declared > limits.totalBytes) {
      throw new Error('The extension archive is too large once unpacked.');
    }
    return true;
  };
}

function readManifest(bytes: Uint8Array | undefined): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`The extension archive has no readable ${MANIFEST}.`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${MANIFEST} must hold a JSON object.`);
  }
  return value as Manifest;
}

/**
 * Reads an extension archive in memory within `limits`. Entries are never
 * written as links: a link stored in the archive comes back as an ordinary
 * file holding its target's name, which the signature then covers.
 */
export function readExtensionArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): ExtensionArchive {
  if (bytes.length > limits.archiveBytes) {
    throw new Error('The extension archive is too large.');
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: admit(limits) });
  } catch (error) {
    throw error instanceof Error && error.message.startsWith('The extension archive')
      ? error
      : new Error('The extension archive is not a valid ZIP file.');
  }
  const files = new Map(Object.entries(entries));
  // Sizes in the headers can lie; the bytes actually unpacked cannot.
  const total = [...files.values()].reduce((sum, file) => sum + file.length, 0);
  if (
    total > limits.totalBytes ||
    [...files.values()].some((file) => file.length > limits.fileBytes)
  ) {
    throw new Error('The extension archive is too large once unpacked.');
  }
  const manifest = readManifest(files.get(MANIFEST));
  files.delete(MANIFEST);
  return { manifest, files };
}

/** Checks an archive's signature over its manifest and every file it holds. */
export function verifyArchive(archive: ExtensionArchive): Verification {
  const digests: FileDigest[] = [...archive.files].map(([path, bytes]) => [
    path,
    createHash('sha256').update(bytes).digest('hex'),
  ]);
  return verifyManifest(archive.manifest, digests);
}
