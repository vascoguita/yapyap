import type { ExtensionConsent, ExtensionTrust } from '../../shared/chrome-api.ts';
import type { InstallDecision } from './decision.ts';
import type { InstallRequest } from './install-request.ts';
import type { ApprovableInstall, PreparedInstall } from './installer.ts';

/** How an install ended, for the message the user sees; extensions the user declined say nothing. */
export type InstallOutcome =
  | { readonly kind: 'installed'; readonly name: string; readonly version: string }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'failed' };

export interface InstallFlowDependencies {
  /** Asks the user for a `.yapyap-extension` archive; undefined when they cancel. */
  readonly chooseArchive: () => Promise<string | undefined>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly prepare: (bytes: Uint8Array) => Promise<PreparedInstall>;
  readonly commit: (install: ApprovableInstall) => Promise<unknown>;
  readonly ask: (consent: ExtensionConsent) => Promise<boolean>;
  readonly report: (outcome: InstallOutcome) => void;
}

export function trustOf(record: Pick<InstallRequest, 'firstParty' | 'developer'>): ExtensionTrust {
  if (record.firstParty) {
    return 'first-party';
  }
  return record.developer ? 'developer' : 'third-party';
}

type Askable = Extract<InstallDecision, { kind: 'consent' | 'reapprove' }>;

function consentOf(decision: Askable, source: string | null): ExtensionConsent {
  const { request } = decision;
  return {
    id: request.id,
    name: request.name,
    version: request.version,
    author: { name: request.author.name, url: request.author.url ?? null },
    fingerprint: request.fingerprint ?? null,
    trust: trustOf(request),
    update: decision.kind === 'reapprove',
    capabilities: request.capabilities,
    hosts: request.hosts,
    added: decision.kind === 'reapprove' ? decision.added : { capabilities: [], hosts: [] },
    source,
  };
}

/** Whether the user agreed, or did not have to: an update that asks for nothing new. */
async function agreed(
  install: ApprovableInstall,
  deps: Pick<InstallFlowDependencies, 'ask'>,
  source: string | null,
): Promise<boolean> {
  const { decision } = install;
  return decision.kind === 'approved' || deps.ask(consentOf(decision, source));
}

/**
 * Asks about a prepared install and commits it once the user agrees, or
 * reports why it cannot be installed. `source` names the author's host a
 * third-party extension from the marketplace was downloaded from (ADR 0014),
 * which the consent window shows.
 */
export async function finishInstall(
  prepared: PreparedInstall,
  deps: Pick<InstallFlowDependencies, 'commit' | 'ask' | 'report'>,
  source: string | null = null,
): Promise<void> {
  if (!('archive' in prepared)) {
    deps.report({ kind: 'rejected', reason: prepared.decision.reason });
    return;
  }
  if (await agreed(prepared, deps, source)) {
    await deps.commit(prepared);
    const { name, version } = prepared.decision.request;
    deps.report({ kind: 'installed', name, version });
  }
}

/**
 * Installs an extension archive the user picks. Nothing reaches the disk until
 * the archive passed every check and the user agreed to what it asks for.
 */
export async function installExtension(deps: InstallFlowDependencies): Promise<void> {
  try {
    const path = await deps.chooseArchive();
    if (path === undefined) {
      return;
    }
    await finishInstall(await deps.prepare(await deps.readFile(path)), deps);
  } catch {
    deps.report({ kind: 'failed' });
  }
}
