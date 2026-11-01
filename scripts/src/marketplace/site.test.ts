import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signIndex } from '../../../packages/extension-sign/src/index-signature.ts';
import type { MarketplaceIndex } from '../../../packages/sdk/src/marketplace.ts';
import { siteExtensions, verifiedIndex } from './site.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const NOW = new Date('2026-10-27T09:00:00.000Z');

const version = (number: string, published = '2026-10-20T08:00:00.000Z') => ({
  version: number,
  size: 10,
  sha256: `sha256-${'A'.repeat(43)}=`,
  capabilities: ['composer:insert-draft', 'local-network'],
  hosts: ['api.example.org'],
  minYapYap: '0.1.2',
  published,
});

const EXTENSION: MarketplaceIndex['extensions'][number] = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example', url: 'https://example.org' },
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'reviewed',
  signer: SIGNER,
  versions: [
    version('1.0.0'),
    version('1.1.0-beta.1'),
    { ...version('1.1.0', '2026-10-25T08:00:00.000Z'), notes: 'Faster greetings.' },
  ],
};

const INDEX: MarketplaceIndex = {
  format: 1,
  serial: 1,
  generated: '2026-10-27T08:00:00.000Z',
  expires: '2026-11-20T08:00:00.000Z',
  extensions: [EXTENSION],
  revoked: [],
};

const key = generateKeyPairSync('ed25519');
const ANCHOR = key.publicKey.export({ format: 'pem', type: 'spki' });
const signed = (index: unknown) => {
  const bytes = new TextEncoder().encode(typeof index === 'string' ? index : JSON.stringify(index));
  return { bytes, signature: signIndex(bytes, key.privateKey) };
};

describe('verifiedIndex', () => {
  it('reads an index a trust anchor signed', () => {
    const { bytes, signature } = signed(INDEX);
    expect(verifiedIndex(bytes, signature, [ANCHOR], NOW)).toEqual(INDEX);
  });

  it.each([
    [
      'signed by another key',
      () => {
        const { bytes } = signed(INDEX);
        return { bytes, signature: signIndex(bytes, generateKeyPairSync('ed25519').privateKey) };
      },
    ],
    ['not JSON', () => signed('{')],
    ['not an index', () => signed({ ...INDEX, format: 2 })],
    ['expired', () => signed({ ...INDEX, expires: '2026-10-27T09:00:00.000Z' })],
  ])('lists nothing from an index %s', (_case, files) => {
    const { bytes, signature } = files();
    expect(verifiedIndex(bytes, signature, [ANCHOR], NOW)).toBeUndefined();
  });
});

describe('siteExtensions', () => {
  const describeCapability = (capability: string) => `can ${capability}`;

  it('shows each extension by name, with its newest version’s requests and every version offered', () => {
    const official = {
      ...EXTENSION,
      id: 'org.guita.yapyap.call-recorder',
      name: 'Call recorder',
      review: 'official' as const,
      author: { name: 'YapYap' },
    };
    expect(
      siteExtensions({ ...INDEX, extensions: [EXTENSION, official] }, describeCapability),
    ).toEqual([
      expect.objectContaining({
        id: 'org.guita.yapyap.call-recorder',
        review: 'official',
        author: { name: 'YapYap', url: null },
        installLink: 'yapyap://extensions/install/org.guita.yapyap.call-recorder',
      }),
      {
        id: 'org.example.hello',
        name: 'Hello',
        summary: 'Says hello.',
        author: { name: 'Example', url: 'https://example.org' },
        homepage: 'https://example.org/hello',
        license: 'MIT',
        review: 'reviewed',
        asks: ['can composer:insert-draft', 'can local-network'],
        hosts: ['api.example.org'],
        screenshots: [],
        versions: [
          {
            version: '1.1.0',
            published: '2026-10-25',
            minYapYap: '0.1.2',
            notes: 'Faster greetings.',
          },
          { version: '1.1.0-beta.1', published: '2026-10-20', minYapYap: '0.1.2', notes: null },
          { version: '1.0.0', published: '2026-10-20', minYapYap: '0.1.2', notes: null },
        ],
        installLink: 'yapyap://extensions/install/org.example.hello',
      },
    ]);
  });

  it('leaves out pulled versions, and extensions with none left', () => {
    const pulledSome = siteExtensions(
      {
        ...INDEX,
        revoked: [{ id: EXTENSION.id, versions: ['1.1.0'], signer: SIGNER, reason: 'Broken.' }],
      },
      describeCapability,
    );
    expect(pulledSome[0]?.versions.map(({ version: number }) => number)).toEqual([
      '1.1.0-beta.1',
      '1.0.0',
    ]);
    const other = Array.from({ length: 32 }, () => 'cd').join(':');
    expect(
      siteExtensions(
        { ...INDEX, revoked: [{ id: EXTENSION.id, versions: '*', signer: other, reason: 'x' }] },
        describeCapability,
      ),
    ).toHaveLength(1);
    expect(
      siteExtensions(
        {
          ...INDEX,
          revoked: [{ id: 'org.example.other', versions: '*', signer: SIGNER, reason: 'x' }],
        },
        describeCapability,
      ),
    ).toHaveLength(1);
    expect(
      siteExtensions(
        {
          ...INDEX,
          revoked: [{ id: EXTENSION.id, versions: '*', signer: SIGNER, reason: 'Gone.' }],
        },
        describeCapability,
      ),
    ).toEqual([]);
  });
});
