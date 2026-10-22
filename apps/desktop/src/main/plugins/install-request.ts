import type { Capability, Manifest } from '@yapyap/plugin-sdk';
import { compareCodeUnits } from '@yapyap/plugin-sign';

/** Who vouches for a plugin's files: a verified key, or nobody in Developer Mode. */
export type Signer =
  | { readonly kind: 'signed'; readonly fingerprint: string; readonly firstParty: boolean }
  | { readonly kind: 'unsigned' };

/**
 * Everything the consent screen shows before the user agrees to an install
 * or update (ADR 0004), and nothing it would have to look up elsewhere.
 */
export interface InstallRequest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: { readonly name: string; readonly url: string | undefined };
  /** Undefined for an unsigned plugin, which only Developer Mode installs. */
  readonly fingerprint: string | undefined;
  readonly firstParty: boolean;
  readonly developer: boolean;
  readonly capabilities: readonly Capability[];
  readonly hosts: readonly string[];
}

/** Sorted so the consent screen and the stored grants never depend on manifest order. */
export function installRequest(manifest: Manifest, signer: Signer): InstallRequest {
  const signed = signer.kind === 'signed';
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: { name: manifest.author.name, url: manifest.author.url },
    fingerprint: signed ? signer.fingerprint : undefined,
    firstParty: signed && signer.firstParty,
    developer: !signed,
    capabilities: [...manifest.capabilities].sort(compareCodeUnits),
    hosts: [...(manifest.network?.hosts ?? [])].sort(compareCodeUnits),
  };
}
