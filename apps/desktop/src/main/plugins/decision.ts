import type { Manifest } from '@yapyap/plugin-sdk';
import {
  decideTrust,
  FIRST_PARTY_PREFIX,
  verifyArchive,
  type PluginArchive,
} from '@yapyap/plugin-sign';
import { diffGrants, type Grants } from './approvals.ts';
import { installRequest, type InstallRequest, type Signer } from './install-request.ts';
import { checkManifest } from './manifest.ts';
import type { PluginRecord, PluginRecords } from './records.ts';

/** What may happen with a plugin archive the user picked. */
export type InstallDecision =
  | { readonly kind: 'rejected'; readonly reason: string }
  /** A new plugin, or a new key for one: the user sees everything it asks for. */
  | { readonly kind: 'consent'; readonly request: InstallRequest }
  /** An update asking for more than the user granted: install only once they agree. */
  | { readonly kind: 'reapprove'; readonly request: InstallRequest; readonly added: Grants }
  /** An update asking for nothing new, which may install without asking. */
  | { readonly kind: 'approved'; readonly request: InstallRequest };

export interface DecisionInput {
  readonly archive: PluginArchive;
  readonly records: PluginRecords;
  /** Fingerprints of the embedded first-party keys. */
  readonly anchors: ReadonlySet<string>;
  /** Only Developer Mode installs unsigned plugins (ADR 0004). */
  readonly developerMode: boolean;
}

type SignerResult = Signer | { readonly kind: 'rejected'; readonly reason: string };

function unsignedSigner(
  manifest: Manifest,
  installed: PluginRecord | undefined,
  developerMode: boolean,
): SignerResult {
  if (!developerMode) {
    return { kind: 'rejected', reason: 'Unsigned plugins install only in Developer Mode.' };
  }
  if (manifest.id.startsWith(FIRST_PARTY_PREFIX)) {
    return { kind: 'rejected', reason: 'Only YapYap can publish plugins under its own name.' };
  }
  // Dropping the signature must not be a way around the pinned key.
  return (installed?.fingerprint ?? null) === null
    ? { kind: 'unsigned' }
    : { kind: 'rejected', reason: 'This update is not signed, but the installed plugin is.' };
}

function signerOf(
  input: DecisionInput,
  manifest: Manifest,
  installed: PluginRecord | undefined,
): SignerResult {
  if (manifest.signature === undefined) {
    return unsignedSigner(manifest, installed, input.developerMode);
  }
  const trust = decideTrust({
    pluginId: manifest.id,
    verification: verifyArchive(input.archive),
    anchors: input.anchors,
    pinned: installed?.fingerprint ?? undefined,
  });
  if (trust.kind === 'rejected') {
    return trust;
  }
  return {
    kind: 'signed',
    fingerprint: trust.fingerprint,
    firstParty: trust.kind === 'trusted' && trust.firstParty,
  };
}

/**
 * Decides an install or update: the manifest must be valid, the key trusted
 * (or the plugin unsigned in Developer Mode), and any grant the user has not
 * given yet must be asked for. Switching between unsigned and signed asks
 * again from scratch, since a different party now vouches for the files.
 */
export function decideInstall(input: DecisionInput): InstallDecision {
  const check = checkManifest(input.archive);
  if (!check.valid) {
    return { kind: 'rejected', reason: check.reason };
  }
  const installed = input.records.get(check.manifest.id);
  const signer = signerOf(input, check.manifest, installed);
  if (signer.kind === 'rejected') {
    return signer;
  }
  const request = installRequest(check.manifest, signer);
  if (installed?.developer !== request.developer) {
    return { kind: 'consent', request };
  }
  const change = diffGrants(installed, request);
  return change.kind === 'none'
    ? { kind: 'approved', request }
    : { kind: 'reapprove', added: change.added, request };
}
