import { Value } from 'typebox/value';
import {
  readExtensionArchive,
  verifyArchive,
} from '../../../packages/extension-sign/src/archive.ts';
import { signIndex, verifyIndex } from '../../../packages/extension-sign/src/index-signature.ts';
import { matchesIntegrity } from '../../../packages/extension-sign/src/integrity.ts';
import { readPrivateKey } from '../../../packages/extension-sign/src/keys.ts';
import { ManifestSchema } from '../../../packages/sdk/src/manifest.ts';
import {
  MARKETPLACE_MAX_VALIDITY_MS,
  marketplaceArchiveUrl,
  MarketplaceIndexSchema,
  type MarketplaceIndex,
} from '../../../packages/sdk/src/marketplace.ts';
import type { Entry, Revocations } from './entries.ts';
import { screenshotsOf } from './screenshots.ts';

type Listed = MarketplaceIndex['extensions'][number];
type ListedVersion = Listed['versions'][number];

/** What an archive's manifest says, as far as the index repeats it. */
interface Described {
  readonly name: string;
  readonly author: Listed['author'];
  readonly version: ListedVersion;
}

/** A version's notes, when its entry has any; the index leaves the field out otherwise. */
const notesOf = ({ notes }: Entry['versions'][number]): { notes?: string } =>
  notes === undefined ? {} : { notes };

/** Reads a version's manifest for the index, after its signature and identity check out. */
function describe(entry: Entry, listed: Entry['versions'][number], bytes: Uint8Array): Described {
  const { manifest, files } = readExtensionArchive(bytes);
  const verification = verifyArchive({ manifest, files });
  if (!verification.valid) {
    throw new Error(verification.reason);
  }
  if (verification.fingerprint !== entry.signer) {
    throw new Error(`it is signed by ${verification.fingerprint}, not the listed key.`);
  }
  if (!Value.Check(ManifestSchema, manifest)) {
    throw new Error('its manifest does not match the manifest schema.');
  }
  if (manifest.id !== entry.id || manifest.version !== listed.version) {
    throw new Error('its manifest names another extension or version.');
  }
  return {
    name: manifest.name,
    author: manifest.author,
    version: {
      version: listed.version,
      size: bytes.length,
      sha256: listed.sha256,
      capabilities: [...manifest.capabilities],
      hosts: [...(manifest.network?.hosts ?? [])],
      minYapYap: listed.minYapYap,
      published: listed.published,
      ...notesOf(listed),
    },
  };
}

/** One listed version, checked against the archive downloaded from its source. */
function checkVersion(
  entry: Entry,
  listed: Entry['versions'][number],
  bytes: Uint8Array | undefined,
  anchors: ReadonlySet<string>,
): Described {
  if (bytes === undefined) {
    throw new Error('its archive could not be downloaded.');
  }
  if (!matchesIntegrity(bytes, listed.sha256)) {
    throw new Error('its archive does not match the listed SHA-256.');
  }
  if (entry.review === 'official' && !anchors.has(entry.signer)) {
    throw new Error('an official extension must be signed by a trust anchor.');
  }
  return describe(entry, listed, bytes);
}

/** An extension as the index lists it, named after its newest version's manifest. */
function listExtension(
  entry: Entry,
  archives: ReadonlyMap<string, Uint8Array>,
  anchors: ReadonlySet<string>,
): Listed {
  const described = entry.versions.map((listed) => {
    try {
      return checkVersion(entry, listed, archives.get(listed.source), anchors);
    } catch (error) {
      throw new Error(`${entry.id} ${listed.version}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  });
  const newest = described.at(-1);
  if (newest === undefined) {
    throw new Error(`${entry.id} lists no versions.`);
  }
  return {
    id: entry.id,
    name: newest.name,
    summary: entry.summary,
    homepage: entry.homepage,
    license: entry.license,
    review: entry.review,
    signer: entry.signer,
    author: newest.author,
    versions: described.map(({ version }) => version),
  };
}

/** The listed extension with its entry's screenshots, when it has any. */
function withScreenshots(entry: Entry, listed: Listed, sources: IndexSources): Listed {
  const shots = screenshotsOf(entry, sources.screenshots ?? (() => undefined));
  return shots.length === 0 ? listed : { ...listed, screenshots: shots };
}

/** The index's inputs: the entries, the pulled versions and every source's downloaded bytes. */
export interface IndexSources {
  readonly entries: readonly Entry[];
  readonly revoked: Revocations;
  readonly archives: ReadonlyMap<string, Uint8Array>;
  /** Fingerprints of the first-party trust anchors. */
  readonly anchors: ReadonlySet<string>;
  readonly now: Date;
  /** A screenshot's bytes, from `marketplace/screenshots/<id>/<file>`. */
  readonly screenshots?: (id: string, file: string) => Uint8Array | undefined;
}

/**
 * Builds the marketplace index (ADR 0014) from the entries, checking every
 * listed archive's hash, signature, signer and manifest, and failing on the
 * first problem with the extension and version it is in. The serial is the
 * time in seconds, so every build is newer than the one before.
 */
export function buildIndex(sources: IndexSources): MarketplaceIndex {
  const { entries, revoked, archives, anchors, now } = sources;
  const index: MarketplaceIndex = {
    format: 1,
    serial: Math.floor(now.getTime() / 1000),
    generated: now.toISOString(),
    expires: new Date(now.getTime() + MARKETPLACE_MAX_VALIDITY_MS).toISOString(),
    extensions: [...entries]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => withScreenshots(entry, listExtension(entry, archives, anchors), sources)),
    revoked: [...revoked],
  };
  if (!Value.Check(MarketplaceIndexSchema, index)) {
    throw new Error('The built index does not match its schema.');
  }
  return index;
}

/**
 * Cloudflare Pages redirects from each archive's marketplace address to
 * its release asset, as the package repositories do (ADR 0003).
 */
export function archiveRedirects(entries: readonly Entry[]): string {
  return entries
    .flatMap(({ id, versions }) =>
      versions.map(({ version, source }) => {
        const path = new URL(marketplaceArchiveUrl(id, version)).pathname;
        return `${path} ${source} 302`;
      }),
    )
    .join('\n');
}

/** Every source to download, each once. */
export const sourcesOf = (entries: readonly Entry[]): string[] => [
  ...new Set(entries.flatMap(({ versions }) => versions.map(({ source }) => source))),
];

/**
 * Signs the index's exact bytes with YapYap's extension key, and refuses a key
 * the app would not accept: one that is not among the trust anchors.
 */
export function signMarketplaceIndex(
  bytes: Uint8Array,
  keyPem: string,
  anchors: readonly string[],
): string {
  const signature = signIndex(bytes, readPrivateKey(keyPem));
  if (!verifyIndex(bytes, signature, anchors)) {
    throw new Error('The signing key is not one of YapYap’s trust anchors.');
  }
  return signature;
}

/**
 * Downloads every source at once. A source that fails is left out, so the
 * build names the extension and version whose archive is missing.
 */
export async function downloadArchives(
  sources: readonly string[],
  fetcher: (url: string) => Promise<Pick<Response, 'ok' | 'arrayBuffer'>>,
): Promise<Map<string, Uint8Array>> {
  const downloaded = await Promise.all(
    sources.map(async (source): Promise<[string, Uint8Array][]> => {
      const response = await fetcher(source);
      return response.ok ? [[source, new Uint8Array(await response.arrayBuffer())]] : [];
    }),
  );
  return new Map(downloaded.flat());
}
