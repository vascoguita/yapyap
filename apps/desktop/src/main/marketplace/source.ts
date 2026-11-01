import {
  MARKETPLACE_INDEX_URL,
  MARKETPLACE_SIGNATURE_URL,
  marketplaceArchiveName,
  marketplaceArchiveUrl,
} from '@yapyap/extension-sdk';
import { resolveWhatsAppOrigin } from '../whatsapp-origin.ts';

/** Where the marketplace's index, signature and archives come from, and who may sign the index. */
export interface MarketplaceSource {
  readonly indexUrl: string;
  readonly signatureUrl: string;
  readonly archiveUrl: (id: string, version: string) => string;
  /** Where an unreviewed extension's latest archive downloads from, given its listed address. */
  readonly latestUrl: (latest: string) => string;
  /** Whether the marketplace's session may request this address, each redirect included. */
  readonly secure: (url: string) => boolean;
  /** SPKI PEM keys whose signature makes an index trusted. */
  readonly anchors: readonly string[];
}

const isHttps = (url: string): boolean => url.startsWith('https://');

/**
 * The marketplace YapYap uses: packages.guita.org, trusted through the
 * first-party anchors (ADR 0014), and each unreviewed extension's latest
 * archive from its listed address, over HTTPS only. E2E tests run an
 * unpackaged build against a local fake marketplace, signed with a test key,
 * which also serves the latest archives under `/latest/<host><path>`: only
 * an unpackaged build honors that, and only for a plain-HTTP loopback
 * origin, so no installed YapYap can be pointed at another index.
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
      latestUrl: (latest) => latest,
      secure: isHttps,
      anchors,
    };
  }
  return {
    indexUrl: `${test.origin}/extensions/index.json`,
    signatureUrl: `${test.origin}/extensions/index.json.sig`,
    archiveUrl: (id, version) =>
      `${test.origin}/extensions/${id}/${marketplaceArchiveName(id, version)}`,
    latestUrl: (latest) => {
      const { host, pathname } = new URL(latest);
      return `${test.origin}/latest/${host}${pathname}`;
    },
    secure: (url) => isHttps(url) || url.startsWith(`${test.origin}/`),
    anchors: [anchor],
  };
}
