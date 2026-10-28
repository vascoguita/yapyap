import {
  MARKETPLACE_INDEX_MAX_BYTES,
  MARKETPLACE_MAX_VALIDITY_MS,
  MarketplaceIndexSchema,
  type MarketplaceIndex,
} from '@yapyap/extension-sdk';
import { verifyIndex } from '@yapyap/extension-sign';
import { Value } from 'typebox/value';

/** How far ahead of this computer's clock a signed index may be, for a clock that runs late. */
const CLOCK_SKEW_MS = 86_400_000;

/** What the marketplace shows: the index, or why there is none to show. */
export type MarketplaceState =
  | { readonly status: 'ready'; readonly index: MarketplaceIndex }
  /** Offline, or the server did not answer. */
  | { readonly status: 'unreachable' }
  /** Too large, unsigned, signed by another key, or not an index. */
  | { readonly status: 'invalid' }
  /** Past its expiry, or older than one YapYap already accepted (ADR 0014). */
  | { readonly status: 'outdated' };

/** A fetched file's bytes, or undefined when it could not be fetched. */
export type Fetcher = (url: string) => Promise<Uint8Array | undefined>;

export interface IndexClientDependencies {
  readonly indexUrl: string;
  readonly signatureUrl: string;
  /** The first-party trust anchors, as SPKI PEM. */
  readonly anchors: readonly string[];
  readonly fetch: Fetcher;
  readonly now: () => Date;
  /** The highest serial YapYap has accepted; zero before the first. */
  readonly lastSerial: () => Promise<number>;
  readonly saveSerial: (serial: number) => Promise<void>;
}

/** The index in `bytes`, if it parses and matches the schema. */
function parsed(bytes: Uint8Array): MarketplaceIndex | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return Value.Check(MarketplaceIndexSchema, value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the index is current: signed recently, not yet expired, and valid no longer than allowed. */
function current(index: MarketplaceIndex, now: Date): boolean {
  const generated = Date.parse(index.generated);
  const expires = Date.parse(index.expires);
  return (
    generated <= now.getTime() + CLOCK_SKEW_MS &&
    expires > now.getTime() &&
    expires - generated <= MARKETPLACE_MAX_VALIDITY_MS
  );
}

/** The verified index in the downloaded files, or why it cannot be used. */
function verified(
  bytes: Uint8Array,
  signature: Uint8Array,
  deps: IndexClientDependencies,
): MarketplaceState {
  const signed =
    bytes.length <= MARKETPLACE_INDEX_MAX_BYTES &&
    verifyIndex(bytes, new TextDecoder().decode(signature), deps.anchors);
  const index = signed ? parsed(bytes) : undefined;
  if (index === undefined) {
    return { status: 'invalid' };
  }
  return current(index, deps.now()) ? { status: 'ready', index } : { status: 'outdated' };
}

/**
 * Downloads the marketplace index and its signature (ADR 0014), and uses
 * it only if a trust anchor signed its exact bytes, it matches the schema,
 * it has not expired, and its serial is no lower than the last accepted
 * one, so nobody can serve an old copy that still lists a pulled version.
 */
export async function loadMarketplace(deps: IndexClientDependencies): Promise<MarketplaceState> {
  const [bytes, signature] = await Promise.all([
    deps.fetch(deps.indexUrl),
    deps.fetch(deps.signatureUrl),
  ]);
  if (bytes === undefined || signature === undefined) {
    return { status: 'unreachable' };
  }
  const state = verified(bytes, signature, deps);
  if (state.status !== 'ready') {
    return state;
  }
  const last = await deps.lastSerial();
  if (state.index.serial < last) {
    return { status: 'outdated' };
  }
  await deps.saveSerial(state.index.serial);
  return state;
}
