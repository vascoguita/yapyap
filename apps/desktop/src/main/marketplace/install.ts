import { matchesIntegrity } from '@yapyap/plugin-sign';
import { en } from '../../shared/messages/en.ts';
import { finishInstall, type InstallFlowDependencies } from '../plugins/install-flow.ts';
import type { PreparedInstall } from '../plugins/installer.ts';
import type { Fetcher, MarketplaceState } from './index-client.ts';
import { offeredVersion, type ListedVersion } from './listing.ts';

export interface ListedInstallDependencies extends Pick<
  InstallFlowDependencies,
  'prepare' | 'commit' | 'ask' | 'report'
> {
  readonly load: () => Promise<MarketplaceState>;
  readonly appVersion: string;
  readonly download: Fetcher;
  readonly archiveUrl: (id: string, version: string) => string;
}

/** What the index says about the version to install, or nothing when it offers none here. */
async function listing(deps: ListedInstallDependencies, id: string) {
  const state = await deps.load();
  if (state.status !== 'ready') {
    return undefined;
  }
  const plugin = state.index.plugins.find((candidate) => candidate.id === id);
  const offered =
    plugin === undefined ? undefined : offeredVersion(state.index, plugin, deps.appVersion);
  return plugin !== undefined && offered?.runs === true
    ? { plugin, version: offered.version }
    : undefined;
}

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

/** Whether the prepared plugin is the one listed: its ID, version and signer. */
function isListed(prepared: PreparedInstall, id: string, version: string, signer: string): boolean {
  if (!('archive' in prepared)) {
    return true;
  }
  const { request } = prepared.decision;
  return request.id === id && request.version === version && request.fingerprint === signer;
}

/**
 * Installs the version of a plugin the marketplace offers (ADR 0014): the
 * archive must match the signed index's size and SHA-256, and be the listed
 * plugin and version, signed by the listed key. It then goes through the
 * usual checks and consent window; a reviewed plugin is marked as such and
 * needs no acknowledgement.
 */
export async function installListed(deps: ListedInstallDependencies, id: string): Promise<void> {
  try {
    const listed = await listing(deps, id);
    if (listed === undefined) {
      deps.report({ kind: 'rejected', reason: en.plugins.marketplace.unlisted });
      return;
    }
    const { plugin, version } = listed;
    const bytes = await listedArchive(deps, id, version);
    const prepared = bytes === undefined ? undefined : await deps.prepare(bytes);
    if (prepared === undefined || !isListed(prepared, id, version.version, plugin.signer)) {
      deps.report({ kind: 'rejected', reason: en.plugins.marketplace.mismatch });
      return;
    }
    await finishInstall(prepared, deps, plugin.review === 'reviewed');
  } catch {
    deps.report({ kind: 'failed' });
  }
}
