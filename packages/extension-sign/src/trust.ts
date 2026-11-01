import { createPublicKey } from 'node:crypto';
import { fingerprint, isEd25519 } from './keys.ts';
import type { Verification } from './signature.ts';

/** Extension IDs YapYap's own key must sign; nobody else can publish under them. */
export const FIRST_PARTY_PREFIX = 'org.guita.yapyap.';

/** What may happen with a verified extension. */
export type TrustDecision =
  | { readonly kind: 'trusted'; readonly fingerprint: string; readonly firstParty: boolean }
  /** A new third-party author: install only if the user agrees, then pin this key. */
  | { readonly kind: 'consent'; readonly fingerprint: string }
  | { readonly kind: 'rejected'; readonly reason: string };

/** The fingerprints of SPKI PEM anchors; an anchor that is not an Ed25519 key is a build error. */
export function anchorFingerprints(pems: readonly string[]): ReadonlySet<string> {
  return new Set(
    pems.map((pem) => {
      const key = createPublicKey(pem);
      if (!isEd25519(key)) {
        throw new Error('A trust anchor is not an Ed25519 public key.');
      }
      return fingerprint(key);
    }),
  );
}

export interface TrustInput {
  readonly extensionId: string;
  readonly verification: Verification;
  /** Fingerprints of the embedded first-party keys. */
  readonly anchors: ReadonlySet<string>;
  /** The key pinned when this extension was first installed, if it was. */
  readonly pinned: string | undefined;
}

/**
 * Decides whether a verified extension may be installed or updated: first-party
 * extensions need an embedded key, third-party ones keep the key the user
 * accepted first (trust on first use), and nothing unsigned passes here.
 */
export function decideTrust(input: TrustInput): TrustDecision {
  const { verification } = input;
  if (!verification.valid) {
    return { kind: 'rejected', reason: verification.reason };
  }
  const key = verification.fingerprint;
  if (input.extensionId.startsWith(FIRST_PARTY_PREFIX)) {
    return input.anchors.has(key)
      ? { kind: 'trusted', fingerprint: key, firstParty: true }
      : { kind: 'rejected', reason: 'Only YapYap can publish extensions under its own name.' };
  }
  if (input.pinned === undefined) {
    return { kind: 'consent', fingerprint: key };
  }
  return input.pinned === key
    ? { kind: 'trusted', fingerprint: key, firstParty: false }
    : {
        kind: 'rejected',
        reason: 'This update is signed by a different key than the installed extension.',
      };
}
