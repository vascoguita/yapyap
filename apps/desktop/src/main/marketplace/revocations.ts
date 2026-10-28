import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import type { ExtensionRecords } from '../extensions/records.ts';

/** An installed extension the marketplace pulled, and the reason it gives. */
export interface Pulled {
  readonly id: string;
  readonly reason: string;
}

/**
 * The installed extensions a revocation in the index matches (ADR 0014): the
 * same ID, a pulled version, and the same signing key, so nobody can pull
 * someone else's extension by reusing its ID. Extensions already marked are left
 * as they are.
 */
export function pulledExtensions(index: MarketplaceIndex, records: ExtensionRecords): Pulled[] {
  return [...records.values()].flatMap((record) => {
    const revocation = index.revoked.find(
      ({ id, signer, versions }) =>
        id === record.id &&
        signer === record.fingerprint &&
        (versions === '*' || versions.includes(record.version)),
    );
    return revocation === undefined || record.pulled !== undefined
      ? []
      : [{ id: record.id, reason: revocation.reason }];
  });
}
