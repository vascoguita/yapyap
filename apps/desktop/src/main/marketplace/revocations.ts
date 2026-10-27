import type { MarketplaceIndex } from '@yapyap/plugin-sdk';
import type { PluginRecords } from '../plugins/records.ts';

/** An installed plugin the marketplace pulled, and the reason it gives. */
export interface Pulled {
  readonly id: string;
  readonly reason: string;
}

/**
 * The installed plugins a revocation in the index matches (ADR 0014): the
 * same ID, a pulled version, and the same signing key, so nobody can pull
 * someone else's plugin by reusing its ID. Plugins already marked are left
 * as they are.
 */
export function pulledPlugins(index: MarketplaceIndex, records: PluginRecords): Pulled[] {
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
