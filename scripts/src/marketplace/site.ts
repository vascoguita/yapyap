import { Value } from 'typebox/value';
import { verifyIndex } from '../../../packages/extension-sign/src/index-signature.ts';
import {
  MarketplaceIndexSchema,
  type MarketplaceIndex,
} from '../../../packages/sdk/src/marketplace.ts';
import { compareVersions } from '../../../apps/desktop/src/main/marketplace/versions.ts';

/** A listed extension as its page on the website shows it (#390). */
export interface SiteExtension {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly author: { readonly name: string; readonly url: string | null };
  readonly homepage: string;
  readonly license: string;
  readonly review: 'official' | 'reviewed';
  /** What the newest version asks for, in the words YapYap's consent window uses. */
  readonly asks: readonly string[];
  readonly hosts: readonly string[];
  /** Every version still offered, newest first, with the day it was published. */
  /** Pictures of the extension in use, served beside the index. */
  readonly screenshots: readonly { readonly url: string; readonly caption: string }[];
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
 * The index the website lists, checked as YapYap checks it (ADR 0014): a
 * trust anchor signed its exact bytes, it matches the schema, and it has
 * not expired. Anything else lists nothing rather than something unverified.
 */
export function verifiedIndex(
  bytes: Uint8Array,
  signature: string,
  anchors: readonly string[],
  now: Date,
): MarketplaceIndex | undefined {
  if (!verifyIndex(bytes, signature, anchors)) {
    return undefined;
  }
  try {
    const index: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return Value.Check(MarketplaceIndexSchema, index) && Date.parse(index.expires) > now.getTime()
      ? index
      : undefined;
  } catch {
    return undefined;
  }
}

type Listed = MarketplaceIndex['extensions'][number];

const pulled = (index: MarketplaceIndex, extension: Listed, version: string): boolean =>
  index.revoked.some(
    (revocation) =>
      revocation.id === extension.id &&
      revocation.signer === extension.signer &&
      (revocation.versions === '*' || revocation.versions.includes(version)),
  );

type ListedVersion = Listed['versions'][number];

function siteExtension(
  extension: Listed,
  newest: ListedVersion,
  versions: readonly ListedVersion[],
  describe: (capability: string) => string,
): SiteExtension {
  return {
    id: extension.id,
    name: extension.name,
    summary: extension.summary,
    author: { name: extension.author.name, url: extension.author.url ?? null },
    homepage: extension.homepage,
    license: extension.license,
    review: extension.review,
    asks: newest.capabilities.map(describe),
    hosts: newest.hosts,
    screenshots: extension.screenshots ?? [],
    versions: versions.map(({ version, published, minYapYap, notes }) => ({
      version,
      minYapYap,
      published: published.slice(0, 10),
      notes: notes ?? null,
    })),
    installLink: `yapyap://extensions/install/${extension.id}`,
  };
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
    .flatMap((extension) => {
      const offered = extension.versions
        .filter(({ version }) => !pulled(index, extension, version))
        .sort((a, b) => compareVersions(b.version, a.version));
      const [newest] = offered;
      return newest === undefined ? [] : [siteExtension(extension, newest, offered, describe)];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
