import type { MarketplaceEntry } from '../../shared/chrome-api.ts';
import { compareVersions, revocationOf, type MarketplaceIndex } from '@yapyap/extension-sdk';
import type { Unreviewed } from './latest.ts';

type Listed = MarketplaceIndex['extensions'][number];
type Official = Extract<Listed, { review: 'official' }>;
export type ListedVersion = Official['versions'][number];

/** Whether a revocation pulls this version of this extension; `*` asks about the whole extension. */
export const isPulled = (index: MarketplaceIndex, extension: Listed, version: string): boolean =>
  revocationOf(index, extension.id, extension.signer, version) !== undefined;

const newest = (versions: readonly ListedVersion[]): ListedVersion | undefined =>
  [...versions].sort((a, b) => compareVersions(b.version, a.version))[0];

/**
 * The version of an official extension to offer: the newest this YapYap runs,
 * leaving out pulled versions; `runs` is false when only newer YapYap
 * versions run the extension. Undefined when every version was pulled.
 */
export function offeredVersion(
  index: MarketplaceIndex,
  extension: Official,
  appVersion: string,
): { readonly version: ListedVersion; readonly runs: boolean } | undefined {
  const available = extension.versions.filter(
    ({ version }) => !isPulled(index, extension, version),
  );
  const running = newest(
    available.filter(({ minYapYap }) => compareVersions(appVersion, minYapYap) >= 0),
  );
  if (running !== undefined) {
    return { version: running, runs: true };
  }
  const any = newest(available);
  return any === undefined ? undefined : { version: any, runs: false };
}

function actionOf(
  offered: string | undefined,
  runs: boolean,
  installed: string | undefined,
): MarketplaceEntry['action'] {
  if (!runs) {
    return 'incompatible';
  }
  if (installed === undefined) {
    return 'install';
  }
  return offered !== undefined && compareVersions(offered, installed) > 0 ? 'update' : 'installed';
}

/** What the Marketplace tab says about any listed extension. */
function common(extension: Listed) {
  return {
    id: extension.id,
    name: extension.name,
    summary: extension.summary,
    author: { name: extension.author.name, url: extension.author.url ?? null },
    homepage: extension.homepage,
    review: extension.review,
  };
}

function officialEntry(
  index: MarketplaceIndex,
  extension: Official,
  installed: string | undefined,
  appVersion: string,
): MarketplaceEntry[] {
  const offered = offeredVersion(index, extension, appVersion);
  if (offered === undefined) {
    return [];
  }
  const { version } = offered;
  return [
    {
      ...common(extension),
      source: null,
      version: version.version,
      capabilities: version.capabilities,
      hosts: version.hosts,
      notes: version.notes ?? null,
      installed: installed ?? null,
      action: actionOf(version.version, offered.runs, installed),
    },
  ];
}

/**
 * An unreviewed extension, offered as an update only when its latest
 * archive, already checked against its key, is newer than the installed
 * version and not pulled. What it asks for shows in the consent window,
 * once YapYap has downloaded it.
 */
function unreviewedEntry(
  index: MarketplaceIndex,
  extension: Unreviewed,
  installed: string | undefined,
  latest: string | undefined,
): MarketplaceEntry[] {
  if (isPulled(index, extension, '*')) {
    return [];
  }
  const version = latest !== undefined && !isPulled(index, extension, latest) ? latest : undefined;
  return [
    {
      ...common(extension),
      source: new URL(extension.latest).host,
      version: version ?? null,
      capabilities: [],
      hosts: [],
      notes: null,
      installed: installed ?? null,
      action: actionOf(version, true, installed),
    },
  ];
}

/**
 * What the Marketplace tab lists: every extension with a version left to
 * offer, with what the user can do about it given the installed versions
 * and the versions unreviewed extensions' latest addresses serve now (both
 * by extension ID), and this YapYap's version.
 */
export function marketplaceEntries(
  index: MarketplaceIndex,
  installed: ReadonlyMap<string, string>,
  appVersion: string,
  latest: ReadonlyMap<string, string>,
): MarketplaceEntry[] {
  return index.extensions.flatMap((extension) =>
    extension.review === 'official'
      ? officialEntry(index, extension, installed.get(extension.id), appVersion)
      : unreviewedEntry(index, extension, installed.get(extension.id), latest.get(extension.id)),
  );
}
