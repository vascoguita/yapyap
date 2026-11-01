import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signIndex } from '@yapyap/extension-sign';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/extensions.ts';

/** One extension a fake marketplace lists, signed by a test author. */
export interface Listing {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly review: 'official' | 'unreviewed';
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
  readonly author?: string;
  /** Signs an unreviewed extension's latest archive with a key other than the listed one. */
  readonly wrongKey?: boolean;
}

/** Where unreviewed extensions' authors publish their latest archives, in the index. */
export const AUTHOR_HOST = 'downloads.example.org';

const HELLO: Listing = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello in your drafts.',
  review: 'unreviewed',
  capabilities: ['composer:insert-draft'],
  hosts: ['api.example.org'],
};

/** A marketplace served on loopback, with the anchor YapYap must trust to read it. */
export interface FakeMarketplace {
  readonly origin: string;
  readonly anchor: string;
  readonly server: Server;
  /** Publishes a new latest archive of an unreviewed listing, as its author would. */
  readonly release: (id: string, version: string) => void;
}

const sha256 = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

/** An official listing: each version pinned beside the index. */
function official(listing: Listing, archive: Uint8Array, signer: string, now: number) {
  return {
    review: 'official',
    signer,
    versions: [
      {
        version: '1.0.0',
        size: archive.length,
        sha256: sha256(archive),
        capabilities: listing.capabilities,
        hosts: listing.hosts,
        minYapYap: '0.0.1',
        published: new Date(now - 60_000).toISOString(),
      },
    ],
  };
}

/** The index's bytes, its signature by a key made for the test, and that key, to trust. */
function signedIndex(extensions: readonly object[], now: number) {
  const indexKey = generateKeyPairSync('ed25519');
  const index = new TextEncoder().encode(
    JSON.stringify({
      format: 2,
      serial: Math.floor(now / 1000),
      generated: new Date(now - 60_000).toISOString(),
      expires: new Date(now + 86_400_000).toISOString(),
      extensions,
      revoked: [],
    }),
  );
  return {
    index,
    signature: new TextEncoder().encode(signIndex(index, indexKey.privateKey)),
    anchor: indexKey.publicKey.export({ format: 'pem', type: 'spki' }),
  };
}

/**
 * A local marketplace: a signed index listing `listings`, each official
 * one's archive beside it, and each unreviewed one's latest archive on its
 * author's host, which YapYap reaches under `/latest/<host>` in tests.
 */
export async function fakeMarketplace(
  listings: readonly Listing[] = [HELLO],
): Promise<FakeMarketplace> {
  const author = testKey();
  const stranger = testKey();
  const now = Date.now();
  const files = new Map<string, Uint8Array>();
  const archiveOf = (listing: Listing, version: string) =>
    zipArchive(
      signedArchive(
        listing.wrongKey === true ? stranger : author,
        testManifest({
          id: listing.id,
          name: listing.name,
          version,
          capabilities: [...listing.capabilities],
          network: { hosts: [...listing.hosts] },
        }),
      ),
    );
  const latestPath = (id: string) => `/latest/${AUTHOR_HOST}/${id}/latest.yapyap-extension`;
  const extensions = listings.map((listing) => {
    const archive = archiveOf(listing, '1.0.0');
    const common = {
      id: listing.id,
      name: listing.name,
      summary: listing.summary,
      author: { name: listing.author ?? 'Example Author' },
      homepage: 'https://example.org/hello',
      license: 'MIT',
    };
    if (listing.review === 'unreviewed') {
      files.set(latestPath(listing.id), archive);
      const latest = `https://${AUTHOR_HOST}/${listing.id}/latest.yapyap-extension`;
      return { ...common, review: 'unreviewed', signer: author.fingerprint, latest };
    }
    files.set(`/extensions/${listing.id}/${listing.id}-1.0.0.yapyap-extension`, archive);
    return { ...common, ...official(listing, archive, author.fingerprint, now) };
  });
  const { index, signature, anchor } = signedIndex(extensions, now);
  files.set('/extensions/index.json', index).set('/extensions/index.json.sig', signature);
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '');
    // An ETag lets YapYap tell with HEAD that a latest archive did not change.
    const headers = body === undefined ? {} : { ETag: `"${sha256(body)}"` };
    response.writeHead(body === undefined ? 404 : 200, headers).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const listed = new Map(listings.map((listing) => [listing.id, listing]));
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    anchor,
    server,
    release: (id, version) => {
      const listing = listed.get(id);
      if (listing !== undefined) {
        files.set(latestPath(id), archiveOf(listing, version));
      }
    },
  };
}

/** The environment that points YapYap at a fake marketplace (unpackaged builds only). */
export const marketplaceEnv = (marketplace: FakeMarketplace): Record<string, string> => ({
  YAPYAP_TEST_MARKETPLACE_ORIGIN: marketplace.origin,
  YAPYAP_TEST_MARKETPLACE_ANCHOR: marketplace.anchor,
});
