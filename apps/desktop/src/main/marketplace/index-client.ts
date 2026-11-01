import {
  MARKETPLACE_INDEX_MAX_BYTES,
  readMarketplaceIndex,
  type MarketplaceIndexReading,
} from '@yapyap/extension-sdk';
import { verifyIndex } from '@yapyap/extension-sign';

/** What the marketplace shows: the index, or why there is none to show. */
export type MarketplaceState =
  | MarketplaceIndexReading
  /** Offline, or the server did not answer. */
  | { readonly status: 'unreachable' };

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
  const signed =
    bytes.length <= MARKETPLACE_INDEX_MAX_BYTES &&
    verifyIndex(bytes, new TextDecoder().decode(signature), deps.anchors);
  const state: MarketplaceIndexReading = signed
    ? readMarketplaceIndex(new TextDecoder().decode(bytes), deps.now())
    : { status: 'invalid' };
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
