import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { readExtensionArchive, verifyArchive } from '@yapyap/extension-sign';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { writeTextAtomically } from '../atomic-write.ts';
import { checkManifest } from '../extensions/manifest.ts';
import type { ExtensionRecords } from '../extensions/records.ts';
import type { LatestDownload, LatestFetcher, Validators } from './fetch.ts';

/** A third-party extension the marketplace lists without review (ADR 0014). */
export type Unreviewed = Extract<MarketplaceIndex['extensions'][number], { review: 'unreviewed' }>;

/**
 * Beside the extensions' records, starting with a dot so it never shares a
 * name with an extension's folder: what each latest address served when
 * YapYap last downloaded it, by address, so an unchanged file is not
 * downloaded again.
 */
const SEEN_FILE = '.marketplace-latest.json';

const Validator = Type.Union([Type.String({ maxLength: 200 }), Type.Null()]);
const SeenSchema = Type.Record(
  Type.String(),
  Type.Object({
    etag: Validator,
    lastModified: Validator,
    version: Type.String({ maxLength: 256 }),
  }),
);

/** What a latest address served last time: what identified the file, and its version. */
interface Seen extends Validators {
  readonly version: string;
}

/** What downloading an unreviewed extension's latest archive gave. */
export type LatestArchive =
  | { readonly kind: 'archive'; readonly bytes: Uint8Array; readonly version: string }
  /** Nothing came back: offline, a server error, a redirect to plain HTTP, or too large. */
  | { readonly kind: 'unreachable' }
  /** An archive, but not the listed extension signed by its listed key. */
  | { readonly kind: 'mismatch' };

export interface LatestReleases {
  /**
   * The version each installed unreviewed extension's latest address serves
   * now, by ID, when its listed key signed it; extensions not installed, or
   * installed with another key, are not looked at.
   */
  readonly versions: (
    extensions: readonly Unreviewed[],
    records: ExtensionRecords,
  ) => Promise<Map<string, string>>;
  readonly download: (extension: Unreviewed) => Promise<LatestArchive>;
}

export interface LatestDependencies {
  /** Where extensions are installed; what was seen is kept there. */
  readonly root: string;
  readonly fetcher: LatestFetcher;
  readonly latestUrl: (latest: string) => string;
}

/**
 * The version in an archive, if it is the listed extension, signed by the
 * listed key, with a manifest YapYap could run; any other archive is
 * refused, whatever its version.
 */
export function signedVersion(bytes: Uint8Array, extension: Unreviewed): string | undefined {
  try {
    const archive = readExtensionArchive(bytes);
    const verification = verifyArchive(archive);
    const check = checkManifest(archive);
    if (!verification.valid || verification.fingerprint !== extension.signer || !check.valid) {
      return undefined;
    }
    return check.manifest.id === extension.id ? check.manifest.version : undefined;
  } catch {
    return undefined;
  }
}

async function readSeen(root: string): Promise<Map<string, Seen>> {
  try {
    const value: unknown = JSON.parse(await readFile(join(root, SEEN_FILE), 'utf8'));
    return Value.Check(SeenSchema, value) ? new Map(Object.entries(value)) : new Map();
  } catch {
    return new Map();
  }
}

const sameFile = (now: Validators, seen: Validators): boolean =>
  now.etag === seen.etag && now.lastModified === seen.lastModified;

/** The archive's version once verified, remembering what identified it when the server said. */
function verified(
  downloaded: LatestDownload,
  extension: Unreviewed,
  seen: Map<string, Seen>,
): LatestArchive {
  const version = signedVersion(downloaded.bytes, extension);
  if (version === undefined) {
    return { kind: 'mismatch' };
  }
  if (downloaded.validators !== undefined) {
    seen.set(extension.latest, { ...downloaded.validators, version });
  }
  return { kind: 'archive', bytes: downloaded.bytes, version };
}

/** Downloads an unreviewed extension's latest archive and checks it against its listed key. */
async function fetchArchive(
  deps: LatestDependencies,
  extension: Unreviewed,
  seen: Map<string, Seen>,
): Promise<LatestArchive> {
  const downloaded = await deps.fetcher.download(deps.latestUrl(extension.latest));
  return downloaded === undefined ? { kind: 'unreachable' } : verified(downloaded, extension, seen);
}

/** Whether the latest address still serves the file it served last time, by what identifies it. */
async function unchanged(deps: LatestDependencies, extension: Unreviewed, last: Seen) {
  const now = await deps.fetcher.head(deps.latestUrl(extension.latest));
  return now !== undefined && sameFile(now, last);
}

/** The version the latest address serves now, downloading it only when it may have changed. */
async function versionOf(
  deps: LatestDependencies,
  extension: Unreviewed,
  seen: Map<string, Seen>,
): Promise<string | undefined> {
  const last = seen.get(extension.latest);
  if (last !== undefined && (await unchanged(deps, extension, last))) {
    return last.version;
  }
  const latest = await fetchArchive(deps, extension, seen);
  return latest.kind === 'archive' ? latest.version : undefined;
}

async function saveSeen(root: string, seen: Map<string, Seen>): Promise<void> {
  // Nothing may be installed yet, so the extensions folder may not exist.
  await mkdir(root, { recursive: true });
  writeTextAtomically(join(root, SEEN_FILE), `${JSON.stringify(Object.fromEntries(seen))}\n`);
}

/**
 * Unreviewed extensions' latest releases (ADR 0014). To notice a new one,
 * YapYap first asks with `HEAD` what identifies the file, its ETag and
 * Last-Modified, and compares them with what it saw last time: the same
 * file needs no download. Anything else downloads the archive, capped at
 * the archive limit, and reads its version only once its signature checks
 * out against the listed key.
 */
export function latestReleases(deps: LatestDependencies): LatestReleases {
  return {
    versions: async (extensions, records) => {
      const installed = extensions.filter(
        ({ id, signer }) => records.get(id)?.fingerprint === signer,
      );
      if (installed.length === 0) {
        return new Map();
      }
      const seen = await readSeen(deps.root);
      const found = await Promise.all(
        installed.map(
          async (extension) => [extension.id, await versionOf(deps, extension, seen)] as const,
        ),
      );
      await saveSeen(deps.root, seen);
      return new Map(
        found.flatMap(([id, version]) => (version === undefined ? [] : [[id, version]])),
      );
    },
    download: async (extension) => {
      const seen = await readSeen(deps.root);
      const latest = await fetchArchive(deps, extension, seen);
      await saveSeen(deps.root, seen);
      return latest;
    },
  };
}
