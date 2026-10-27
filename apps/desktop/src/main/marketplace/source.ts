import {
  MARKETPLACE_INDEX_URL,
  MARKETPLACE_SIGNATURE_URL,
  marketplaceArchiveName,
  marketplaceArchiveUrl,
} from '@yapyap/plugin-sdk';
import { resolveWhatsAppOrigin } from '../whatsapp-origin.ts';

/** Where the marketplace's index, signature and archives come from, and who may sign the index. */
export interface MarketplaceSource {
  readonly indexUrl: string;
  readonly signatureUrl: string;
  readonly archiveUrl: (id: string, version: string) => string;
  /** SPKI PEM keys whose signature makes an index trusted. */
  readonly anchors: readonly string[];
}

/**
 * The marketplace YapYap uses: packages.guita.org, trusted through the
 * first-party anchors (ADR 0014). E2E tests run an unpackaged build against
 * a local fake marketplace, signed with a test key: only an unpackaged
 * build honors that, and only for a plain-HTTP loopback origin, so no
 * installed YapYap can be pointed at another index.
 */
export function marketplaceSource(
  env: Readonly<Record<string, string | undefined>>,
  packaged: boolean,
  anchors: readonly string[],
): MarketplaceSource {
  const test = resolveWhatsAppOrigin(env['YAPYAP_TEST_MARKETPLACE_ORIGIN']);
  const anchor = env['YAPYAP_TEST_MARKETPLACE_ANCHOR'] ?? '';
  if (packaged || !test.overridden || anchor === '') {
    return {
      indexUrl: MARKETPLACE_INDEX_URL,
      signatureUrl: MARKETPLACE_SIGNATURE_URL,
      archiveUrl: marketplaceArchiveUrl,
      anchors,
    };
  }
  return {
    indexUrl: `${test.origin}/plugins/index.json`,
    signatureUrl: `${test.origin}/plugins/index.json.sig`,
    archiveUrl: (id, version) =>
      `${test.origin}/plugins/${id}/${marketplaceArchiveName(id, version)}`,
    anchors: [anchor],
  };
}
