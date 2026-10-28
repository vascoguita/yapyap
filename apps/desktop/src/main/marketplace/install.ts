import { matchesIntegrity } from '@yapyap/extension-sign';
import { en } from '../../shared/messages/en.ts';
import { finishInstall, type InstallFlowDependencies } from '../extensions/install-flow.ts';
import type { PreparedInstall } from '../extensions/installer.ts';
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
  const extension = state.index.extensions.find((candidate) => candidate.id === id);
  const offered =
    extension === undefined ? undefined : offeredVersion(state.index, extension, deps.appVersion);
  return extension !== undefined && offered?.runs === true
    ? { extension, version: offered.version }
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

/** Whether the prepared extension is the one listed: its ID, version and signer. */
function isListed(prepared: PreparedInstall, id: string, version: string, signer: string): boolean {
  if (!('archive' in prepared)) {
    return true;
  }
  const { request } = prepared.decision;
  return request.id === id && request.version === version && request.fingerprint === signer;
}

/**
 * Installs the version of an extension the marketplace offers (ADR 0014): the
 * archive must match the signed index's size and SHA-256, and be the listed
 * extension and version, signed by the listed key. It then goes through the
 * usual checks and consent window; a reviewed extension is marked as such and
 * needs no acknowledgement.
 */
export async function installListed(deps: ListedInstallDependencies, id: string): Promise<void> {
  try {
    const listed = await listing(deps, id);
    if (listed === undefined) {
      deps.report({ kind: 'rejected', reason: en.extensions.marketplace.unlisted });
      return;
    }
    const { extension, version } = listed;
    const mismatch = { kind: 'rejected', reason: en.extensions.marketplace.mismatch } as const;
    const bytes = await listedArchive(deps, id, version);
    if (bytes === undefined) {
      deps.report(mismatch);
      return;
    }
    const prepared = await deps.prepare(bytes);
    if (!isListed(prepared, id, version.version, extension.signer)) {
      deps.report(mismatch);
      return;
    }
    await finishInstall(prepared, deps, extension.review === 'reviewed');
  } catch {
    deps.report({ kind: 'failed' });
  }
}
