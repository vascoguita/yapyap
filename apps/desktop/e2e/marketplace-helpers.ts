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
  readonly review: 'official' | 'reviewed';
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
  readonly author?: string;
}

const HELLO: Listing = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello in your drafts.',
  review: 'reviewed',
  capabilities: ['composer:insert-draft'],
  hosts: ['api.example.org'],
};

/** A marketplace served on loopback, with the anchor YapYap must trust to read it. */
export interface FakeMarketplace {
  readonly origin: string;
  readonly anchor: string;
  readonly server: Server;
}

/** A local marketplace: a signed index listing `listings`, and each one's archive. */
export async function fakeMarketplace(
  listings: readonly Listing[] = [HELLO],
): Promise<FakeMarketplace> {
  const author = testKey();
  const indexKey = generateKeyPairSync('ed25519');
  const now = Date.now();
  const files = new Map<string, Uint8Array>();
  const extensions = listings.map((listing) => {
    const manifest = testManifest({
      id: listing.id,
      name: listing.name,
      capabilities: [...listing.capabilities],
      network: { hosts: [...listing.hosts] },
    });
    const archive = zipArchive(signedArchive(author, manifest));
    files.set(`/extensions/${listing.id}/${listing.id}-1.0.0.yapyap-extension`, archive);
    return {
      id: listing.id,
      name: listing.name,
      summary: listing.summary,
      author: { name: listing.author ?? 'Example Author' },
      homepage: 'https://example.org/hello',
      license: 'MIT',
      review: listing.review,
      signer: author.fingerprint,
      versions: [
        {
          version: '1.0.0',
          size: archive.length,
          sha256: `sha256-${createHash('sha256').update(archive).digest('base64')}`,
          capabilities: listing.capabilities,
          hosts: listing.hosts,
          minYapYap: '0.0.1',
          published: new Date(now - 60_000).toISOString(),
        },
      ],
    };
  });
  const index = new TextEncoder().encode(
    JSON.stringify({
      format: 1,
      serial: Math.floor(now / 1000),
      generated: new Date(now - 60_000).toISOString(),
      expires: new Date(now + 86_400_000).toISOString(),
      extensions,
      revoked: [],
    }),
  );
  files.set('/extensions/index.json', index);
  files.set(
    '/extensions/index.json.sig',
    new TextEncoder().encode(signIndex(index, indexKey.privateKey)),
  );
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '');
    response.writeHead(body === undefined ? 404 : 200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    anchor: indexKey.publicKey.export({ format: 'pem', type: 'spki' }),
    server,
  };
}

/** The environment that points YapYap at a fake marketplace (unpackaged builds only). */
export const marketplaceEnv = (marketplace: FakeMarketplace): Record<string, string> => ({
  YAPYAP_TEST_MARKETPLACE_ORIGIN: marketplace.origin,
  YAPYAP_TEST_MARKETPLACE_ANCHOR: marketplace.anchor,
});
