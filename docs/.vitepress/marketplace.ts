import { TRUST_ANCHORS } from '../../packages/extension-sign/src/anchors.ts';
import {
  MARKETPLACE_INDEX_URL,
  MARKETPLACE_SIGNATURE_URL,
} from '../../packages/sdk/src/marketplace.ts';
import {
  siteExtensions,
  verifiedIndex,
  type SiteExtension,
} from '../../scripts/src/marketplace/site.ts';
import catalog from '../../apps/desktop/src/shared/messages/locales/en.json' with { type: 'json' };

/** A slow or missing server must not stall the build: the page then says the list is unavailable. */
const TIMEOUT_MS = 15_000;

const capabilities: Readonly<Record<string, string>> = catalog.extensions.capabilities;

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The extensions the marketplace lists, read at build time from the signed
 * index and checked as YapYap checks it (ADR 0014); null when it cannot be
 * read or verified, so the site never lists anything unverified.
 */
export async function loadSiteExtensions(): Promise<SiteExtension[] | null> {
  try {
    const [bytes, signature] = await Promise.all([
      download(MARKETPLACE_INDEX_URL),
      download(MARKETPLACE_SIGNATURE_URL),
    ]);
    const index = verifiedIndex(
      bytes,
      new TextDecoder().decode(signature),
      TRUST_ANCHORS,
      new Date(),
    );
    return index === undefined
      ? null
      : siteExtensions(index, (capability) => capabilities[capability] ?? capability);
  } catch {
    return null;
  }
}
