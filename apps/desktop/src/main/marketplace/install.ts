import { compareVersions, type MarketplaceIndex } from '@yapyap/extension-sdk';
import { matchesIntegrity } from '@yapyap/extension-sign';
import { en } from '../../shared/messages/en.ts';
import { finishInstall, type InstallFlowDependencies } from '../extensions/install-flow.ts';
import type { PreparedInstall } from '../extensions/installer.ts';
import type { Fetcher, MarketplaceState } from './index-client.ts';
import type { LatestArchive, LatestReleases, Unreviewed } from './latest.ts';
import { isPulled, offeredVersion, type ListedVersion } from './listing.ts';

type Official = Extract<MarketplaceIndex['extensions'][number], { review: 'official' }>;

export interface ListedInstallDependencies extends Pick<
  InstallFlowDependencies,
  'prepare' | 'commit' | 'ask' | 'report'
> {
  readonly load: () => Promise<MarketplaceState>;
  readonly appVersion: string;
  readonly download: Fetcher;
  readonly archiveUrl: (id: string, version: string) => string;
  /** Downloads an unreviewed extension's latest archive, checked against its listed key. */
  readonly latest: LatestReleases['download'];
  /** The installed version of an extension, if it is installed. */
  readonly installed: (id: string) => Promise<string | undefined>;
}

const text = en.extensions.marketplace;

/** The archive, if it is exactly the one the index lists: same size, same SHA-256. */
async function listedArchive(
  deps: ListedInstallDependencies,
  id: string,
  version: ListedVersion,
): Promise<Uint8Array | undefined> {
  const bytes = await deps.download(deps.archiveUrl(id, version.version));
  return bytes?.length === version.size && matchesIntegrity(bytes, version.sha256)
    ? bytes
    : undefined;
}

/** Whether the prepared extension is the one listed: its ID, version and signer. */
function isListed(prepared: PreparedInstall, id: string, version: string, signer: string): boolean {
  if (!('archive' in prepared)) {
    return true;
  }
  const { request } = prepared.decision;
  return request.id === id && request.version === version && request.fingerprint === signer;
}

/**
 * Installs the version of an official extension the marketplace offers: the
 * archive must match the signed index's size and SHA-256, and be the listed
 * extension and version, signed by the listed key.
 */
async function installOfficial(
  deps: ListedInstallDependencies,
  index: MarketplaceIndex,
  extension: Official,
): Promise<void> {
  const offered = offeredVersion(index, extension, deps.appVersion);
  if (offered?.runs !== true) {
    deps.report({ kind: 'rejected', reason: text.unlisted });
    return;
  }
  const { version } = offered;
  const mismatch = { kind: 'rejected', reason: text.mismatch } as const;
  const bytes = await listedArchive(deps, extension.id, version);
  if (bytes === undefined) {
    deps.report(mismatch);
    return;
  }
  const prepared = await deps.prepare(bytes);
  if (!isListed(prepared, extension.id, version.version, extension.signer)) {
    deps.report(mismatch);
    return;
  }
  await finishInstall(prepared, deps);
}

/** The latest archive, if it may be installed, or why it may not. */
async function accepted(
  deps: ListedInstallDependencies,
  index: MarketplaceIndex,
  extension: Unreviewed,
  latest: LatestArchive,
): Promise<Extract<LatestArchive, { kind: 'archive' }> | string> {
  const host = new URL(extension.latest).host;
  if (latest.kind !== 'archive') {
    return latest.kind === 'mismatch' ? text.wrongKey({ host }) : text.latestUnreachable({ host });
  }
  if (isPulled(index, extension, latest.version)) {
    return text.pulledLatest({ host });
  }
  const installed = await deps.installed(extension.id);
  // The latest address may still serve what is installed, or an older version.
  return installed !== undefined && compareVersions(latest.version, installed) <= 0
    ? text.noUpdate({ host, version: latest.version })
    : latest;
}

/**
 * Installs whatever an unreviewed extension's latest address serves now
 * (ADR 0014), only if the listed key signed it for the listed ID, it was not
 * pulled, and it is newer than the installed version. It then goes through
 * the usual checks, the pinned key among them, and the consent window, which
 * names the author's host and needs the user to accept the risk.
 */
async function installUnreviewed(
  deps: ListedInstallDependencies,
  index: MarketplaceIndex,
  extension: Unreviewed,
): Promise<void> {
  const latest = await accepted(deps, index, extension, await deps.latest(extension));
  if (typeof latest === 'string') {
    deps.report({ kind: 'rejected', reason: latest });
    return;
  }
  const prepared = await deps.prepare(latest.bytes);
  if (!isListed(prepared, extension.id, latest.version, extension.signer)) {
    deps.report({ kind: 'rejected', reason: text.mismatch });
    return;
  }
  await finishInstall(prepared, deps, new URL(extension.latest).host);
}

/**
 * Installs an extension the marketplace lists (ADR 0014), through the usual
 * checks and consent window: an official one from the version the signed
 * index pins, an unreviewed one from its author's latest release.
 */
export async function installListed(deps: ListedInstallDependencies, id: string): Promise<void> {
  try {
    const state = await deps.load();
    const extension =
      state.status === 'ready'
        ? state.index.extensions.find((candidate) => candidate.id === id)
        : undefined;
    if (state.status !== 'ready' || extension === undefined) {
      deps.report({ kind: 'rejected', reason: text.unlisted });
      return;
    }
    await (extension.review === 'official'
      ? installOfficial(deps, state.index, extension)
      : installUnreviewed(deps, state.index, extension));
  } catch {
    deps.report({ kind: 'failed' });
  }
}
