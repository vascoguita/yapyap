import type { MarketplaceEntry } from '../../shared/chrome-api.ts';
import { compareVersions, revocationOf, type MarketplaceIndex } from '@yapyap/extension-sdk';

type Listed = MarketplaceIndex['extensions'][number];
export type ListedVersion = Listed['versions'][number];

const newest = (versions: readonly ListedVersion[]): ListedVersion | undefined =>
  [...versions].sort((a, b) => compareVersions(b.version, a.version))[0];

/**
 * The version of a listed extension to offer: the newest this YapYap runs,
 * leaving out pulled versions; `runs` is false when only newer YapYap
 * versions run the extension. Undefined when every version was pulled.
 */
export function offeredVersion(
  index: MarketplaceIndex,
  extension: Listed,
  appVersion: string,
): { readonly version: ListedVersion; readonly runs: boolean } | undefined {
  const available = extension.versions.filter(
    ({ version }) => revocationOf(index, extension.id, extension.signer, version) === undefined,
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
  offered: string,
  runs: boolean,
  installed: string | undefined,
): MarketplaceEntry['action'] {
  if (!runs) {
    return 'incompatible';
  }
  if (installed === undefined) {
    return 'install';
  }
  return compareVersions(offered, installed) > 0 ? 'update' : 'installed';
}

/**
 * What the Marketplace tab lists: every extension with a version left to
 * offer, with what the user can do about it given the installed versions
 * (by extension ID) and this YapYap's version.
 */
export function marketplaceEntries(
  index: MarketplaceIndex,
  installed: ReadonlyMap<string, string>,
  appVersion: string,
): MarketplaceEntry[] {
  return index.extensions.flatMap((extension) => {
    const offered = offeredVersion(index, extension, appVersion);
    if (offered === undefined) {
      return [];
    }
    const { version } = offered;
    const current = installed.get(extension.id);
    return [
      {
        id: extension.id,
        name: extension.name,
        summary: extension.summary,
        author: { name: extension.author.name, url: extension.author.url ?? null },
        homepage: extension.homepage,
        review: extension.review,
        version: version.version,
        capabilities: version.capabilities,
        hosts: version.hosts,
        notes: version.notes ?? null,
        installed: current ?? null,
        action: actionOf(version.version, offered.runs, current),
      },
    ];
  });
}
