import { verifyIndex } from '../../../packages/extension-sign/src/index-signature.ts';
import {
  MARKETPLACE_INDEX_MAX_BYTES,
  readMarketplaceIndex,
  revocationOf,
  type MarketplaceIndex,
} from '../../../packages/sdk/src/marketplace.ts';
import { compareVersions } from '../../../packages/sdk/src/version.ts';

/** A listed extension as its page on the website shows it (#390). */
export interface SiteExtension {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly author: { readonly name: string; readonly url: string | null };
  readonly homepage: string;
  readonly license: string;
  readonly review: 'official' | 'unreviewed';
  /**
   * The host an unreviewed extension downloads from, its author's own; null
   * for an official one, which downloads from YapYap's.
   */
  readonly source: string | null;
  /** Where an unreviewed extension's source code lives, when its entry says. */
  readonly repository: string | null;
  /**
   * What the newest official version asks for, in the words YapYap's consent
   * window uses; empty for an unreviewed extension, whose latest archive
   * says only when YapYap downloads it.
   */
  readonly asks: readonly string[];
  readonly hosts: readonly string[];
  /** Pictures of the extension in use, served beside the index. */
  readonly screenshots: readonly { readonly url: string; readonly caption: string }[];
  /** Every official version still offered, newest first, with the day it was published. */
  readonly versions: readonly {
    readonly version: string;
    readonly published: string;
    readonly minYapYap: string;
    /** What changed, or null when the entry says nothing. */
    readonly notes: string | null;
  }[];
  /** The link that asks an installed YapYap to install it (#389). */
  readonly installLink: string;
}

/**
 * The index the website lists, read exactly as YapYap reads it (ADR 0014),
 * so the site never lists what YapYap would refuse.
 */
export function verifiedIndex(
  bytes: Uint8Array,
  signature: string,
  anchors: readonly string[],
  now: Date,
): MarketplaceIndex | undefined {
  if (bytes.length > MARKETPLACE_INDEX_MAX_BYTES || !verifyIndex(bytes, signature, anchors)) {
    return undefined;
  }
  const reading = readMarketplaceIndex(new TextDecoder().decode(bytes), now);
  return reading.status === 'ready' ? reading.index : undefined;
}

type Listed = MarketplaceIndex['extensions'][number];
type Official = Extract<Listed, { review: 'official' }>;
type ListedVersion = Official['versions'][number];

/** Whether a revocation pulls this version, or with `*` the whole extension, as YapYap decides it. */
const isPulled = (index: MarketplaceIndex, extension: Listed, version: string): boolean =>
  revocationOf(index, extension.id, extension.signer, version) !== undefined;

/** What the page says about any listed extension, official or not. */
function common(
  extension: Listed,
): Omit<SiteExtension, 'source' | 'repository' | 'asks' | 'hosts' | 'versions'> {
  return {
    id: extension.id,
    name: extension.name,
    summary: extension.summary,
    author: { name: extension.author.name, url: extension.author.url ?? null },
    homepage: extension.homepage,
    license: extension.license,
    review: extension.review,
    screenshots: extension.screenshots ?? [],
    installLink: `yapyap://extensions/install/${extension.id}`,
  };
}

/** An official extension, described by its newest version still offered; none when all were pulled. */
function officialExtension(
  index: MarketplaceIndex,
  extension: Official,
  describe: (capability: string) => string,
): SiteExtension[] {
  const offered = extension.versions
    .filter(({ version }) => !isPulled(index, extension, version))
    .sort((a, b) => compareVersions(b.version, a.version));
  const [newest] = offered;
  if (newest === undefined) {
    return [];
  }
  return [
    {
      ...common(extension),
      source: null,
      repository: null,
      asks: newest.capabilities.map(describe),
      hosts: newest.hosts,
      versions: offered.map(({ version, published, minYapYap, notes }: ListedVersion) => ({
        version,
        minYapYap,
        published: published.slice(0, 10),
        notes: notes ?? null,
      })),
    },
  ];
}

/** An unreviewed extension, unless all of its versions were pulled. */
function unreviewedExtension(
  index: MarketplaceIndex,
  extension: Extract<Listed, { review: 'unreviewed' }>,
): SiteExtension[] {
  if (isPulled(index, extension, '*')) {
    return [];
  }
  return [
    {
      ...common(extension),
      source: new URL(extension.latest).host,
      repository: extension.repository ?? null,
      asks: [],
      hosts: [],
      versions: [],
    },
  ];
}

/**
 * The extensions the website lists, by name: every extension with a version
 * still offered, which is what YapYap would install from its link.
 */
export function siteExtensions(
  index: MarketplaceIndex,
  describe: (capability: string) => string,
): SiteExtension[] {
  return index.extensions
    .flatMap((extension) =>
      extension.review === 'official'
        ? officialExtension(index, extension, describe)
        : unreviewedExtension(index, extension),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
