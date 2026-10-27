import type { MarketplaceIndex } from '@yapyap/plugin-sdk';
import type { MarketplaceEntry } from '../../shared/chrome-api.ts';
import { compareVersions } from './versions.ts';

type Listed = MarketplaceIndex['plugins'][number];
export type ListedVersion = Listed['versions'][number];

/** Whether a revocation pulls this version of this plugin: same ID, same signer (ADR 0014). */
function pulled(index: MarketplaceIndex, plugin: Listed, version: string): boolean {
  return index.revoked.some(
    (revocation) =>
      revocation.id === plugin.id &&
      revocation.signer === plugin.signer &&
      (revocation.versions === '*' || revocation.versions.includes(version)),
  );
}

const newest = (versions: readonly ListedVersion[]): ListedVersion | undefined =>
  [...versions].sort((a, b) => compareVersions(b.version, a.version))[0];

/**
 * The version of a listed plugin to offer: the newest this YapYap runs,
 * leaving out pulled versions; `runs` is false when only newer YapYap
 * versions run the plugin. Undefined when every version was pulled.
 */
export function offeredVersion(
  index: MarketplaceIndex,
  plugin: Listed,
  appVersion: string,
): { readonly version: ListedVersion; readonly runs: boolean } | undefined {
  const available = plugin.versions.filter(({ version }) => !pulled(index, plugin, version));
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
 * What the Marketplace tab lists: every plugin with a version left to
 * offer, with what the user can do about it given the installed versions
 * (by plugin ID) and this YapYap's version.
 */
export function marketplaceEntries(
  index: MarketplaceIndex,
  installed: ReadonlyMap<string, string>,
  appVersion: string,
): MarketplaceEntry[] {
  return index.plugins.flatMap((plugin) => {
    const offered = offeredVersion(index, plugin, appVersion);
    if (offered === undefined) {
      return [];
    }
    const { version } = offered;
    const current = installed.get(plugin.id);
    return [
      {
        id: plugin.id,
        name: plugin.name,
        summary: plugin.summary,
        author: { name: plugin.author.name, url: plugin.author.url ?? null },
        homepage: plugin.homepage,
        review: plugin.review,
        version: version.version,
        capabilities: version.capabilities,
        hosts: version.hosts,
        installed: current ?? null,
        action: actionOf(version.version, offered.runs, current),
      },
    ];
  });
}
