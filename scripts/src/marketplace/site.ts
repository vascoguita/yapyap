import { Value } from 'typebox/value';
import { verifyIndex } from '../../../packages/plugin-sign/src/index-signature.ts';
import {
  MarketplaceIndexSchema,
  type MarketplaceIndex,
} from '../../../packages/sdk/src/marketplace.ts';
import { compareVersions } from '../../../apps/desktop/src/main/marketplace/versions.ts';

/** A listed plugin as its page on the website shows it (#390). */
export interface SitePlugin {
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
  readonly versions: readonly {
    readonly version: string;
    readonly published: string;
    readonly minYapYap: string;
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

type Listed = MarketplaceIndex['plugins'][number];

const pulled = (index: MarketplaceIndex, plugin: Listed, version: string): boolean =>
  index.revoked.some(
    (revocation) =>
      revocation.id === plugin.id &&
      revocation.signer === plugin.signer &&
      (revocation.versions === '*' || revocation.versions.includes(version)),
  );

type ListedVersion = Listed['versions'][number];

function sitePlugin(
  plugin: Listed,
  newest: ListedVersion,
  versions: readonly ListedVersion[],
  describe: (capability: string) => string,
): SitePlugin {
  return {
    id: plugin.id,
    name: plugin.name,
    summary: plugin.summary,
    author: { name: plugin.author.name, url: plugin.author.url ?? null },
    homepage: plugin.homepage,
    license: plugin.license,
    review: plugin.review,
    asks: newest.capabilities.map(describe),
    hosts: newest.hosts,
    versions: versions.map(({ version, published, minYapYap }) => ({
      version,
      published: published.slice(0, 10),
      minYapYap,
    })),
    installLink: `yapyap://plugins/install/${plugin.id}`,
  };
}

/**
 * The plugins the website lists, by name: every plugin with a version
 * still offered, which is what YapYap would install from its link.
 */
export function sitePlugins(
  index: MarketplaceIndex,
  describe: (capability: string) => string,
): SitePlugin[] {
  return index.plugins
    .flatMap((plugin) => {
      const offered = plugin.versions
        .filter(({ version }) => !pulled(index, plugin, version))
        .sort((a, b) => compareVersions(b.version, a.version));
      const [newest] = offered;
      return newest === undefined ? [] : [sitePlugin(plugin, newest, offered, describe)];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
