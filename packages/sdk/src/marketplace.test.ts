import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_INDEX_URL,
  MARKETPLACE_SIGNATURE_URL,
  marketplaceArchiveName,
  marketplaceArchiveUrl,
  MarketplaceIndexSchema,
  readMarketplaceIndex,
  revocationOf,
  type MarketplaceIndex,
} from './marketplace.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');

const INDEX: MarketplaceIndex = {
  format: 2,
  serial: 1_793_000_000,
  generated: '2026-10-27T09:00:00.000Z',
  expires: '2026-11-26T09:00:00.000Z',
  extensions: [
    {
      id: 'org.guita.yapyap.call-recorder',
      name: 'Call recorder',
      summary: 'Suggests replies with the model you choose.',
      author: { name: 'YapYap', url: 'https://yapyap.guita.org' },
      homepage: 'https://yapyap.guita.org/guide/call-recorder',
      license: 'MIT',
      review: 'official',
      signer: SIGNER,
      versions: [
        {
          version: '0.1.0',
          size: 193_676,
          sha256: `sha256-${'A'.repeat(43)}=`,
          capabilities: ['chat:read-active', 'local-network'],
          hosts: ['api.anthropic.com'],
          minYapYap: '0.1.2',
          published: '2026-10-27T08:00:00.000Z',
        },
      ],
    },
    {
      id: 'org.example.hello',
      name: 'Hello',
      summary: 'Says hello.',
      author: { name: 'Example' },
      homepage: 'https://example.org/hello',
      license: 'MIT',
      review: 'unreviewed',
      signer: SIGNER,
      latest: 'https://github.com/example/hello/releases/latest/download/hello.yapyap-extension',
      repository: 'https://github.com/example/hello',
    },
  ],
  revoked: [{ id: 'org.example.bad', versions: '*', signer: SIGNER, reason: 'Sent chats away.' }],
};

describe('MarketplaceIndexSchema', () => {
  it('accepts an index of official and unreviewed extensions, and revocations', () => {
    expect(Value.Check(MarketplaceIndexSchema, INDEX)).toBe(true);
    expect(
      Value.Check(MarketplaceIndexSchema, {
        ...INDEX,
        revoked: [{ ...INDEX.revoked[0], versions: ['1.0.0'] }],
      }),
    ).toBe(true);
  });

  const [extension, unreviewed] = INDEX.extensions;
  const [version] = extension?.review === 'official' ? extension.versions : [];
  const latest = (url: string) => ({ extensions: [{ ...unreviewed, latest: url }] });
  it.each([
    ['another format', { format: 1 }],
    ['a serial below one', { serial: 0 }],
    ['a time that is not one', { generated: 'yesterday' }],
    ['an unknown field', { mirror: 'https://example.org' }],
    ['an unknown review', { extensions: [{ ...extension, review: 'trusted' }] }],
    ['a short fingerprint', { extensions: [{ ...extension, signer: 'ab:cd' }] }],
    ['an extension with no versions', { extensions: [{ ...extension, versions: [] }] }],
    ['a homepage over HTTP', { extensions: [{ ...extension, homepage: 'http://example.org' }] }],
    [
      'a hash in another form',
      { extensions: [{ ...extension, versions: [{ ...version, sha256: 'abc' }] }] },
    ],
    [
      'an archive over 20 MB',
      { extensions: [{ ...extension, versions: [{ ...version, size: 20 * 1024 * 1024 + 1 }] }] },
    ],
    [
      'a grant with markup',
      { extensions: [{ ...extension, versions: [{ ...version, hosts: ['<b>'] }] }] },
    ],
    [
      'a reviewed extension, which no longer exists',
      { extensions: [{ ...extension, review: 'reviewed' }] },
    ],
    [
      'an unreviewed extension with versions',
      { extensions: [{ ...unreviewed, versions: [version] }] },
    ],
    [
      'an unreviewed extension without its latest address',
      { extensions: [{ ...extension, review: 'unreviewed', versions: undefined }] },
    ],
    ['a latest address over HTTP', latest('http://example.org/hello.yapyap-extension')],
    ['a latest address with credentials', latest('https://user:secret@example.org/hello')],
    ['a latest address with no path', latest('https://example.org')],
    ['a latest address with a fragment', latest('https://example.org/hello#x')],
    ['a latest address with a space', latest('https://example.org/hel lo')],
    ['a revocation without a reason', { revoked: [{ ...INDEX.revoked[0], reason: '' }] }],
  ])('refuses %s', (_case, change) => {
    expect(Value.Check(MarketplaceIndexSchema, { ...INDEX, ...change })).toBe(false);
  });
});

describe('marketplace addresses', () => {
  it('keeps the index, its signature and every official archive on YapYap’s own host', () => {
    expect(MARKETPLACE_INDEX_URL).toBe('https://packages.guita.org/extensions/index.json');
    expect(MARKETPLACE_SIGNATURE_URL).toBe('https://packages.guita.org/extensions/index.json.sig');
    expect(marketplaceArchiveName('org.example.hello', '1.2.0-beta.1')).toBe(
      'org.example.hello-1.2.0-beta.1.yapyap-extension',
    );
    expect(marketplaceArchiveUrl('org.example.hello', '1.2.0')).toBe(
      'https://packages.guita.org/extensions/org.example.hello/org.example.hello-1.2.0.yapyap-extension',
    );
  });
});

describe('revocationOf', () => {
  const index: MarketplaceIndex = {
    ...INDEX,
    revoked: [
      { id: 'org.example.bad', versions: '*', signer: SIGNER, reason: 'Sent chats away.' },
      { id: 'org.example.some', versions: ['1.0.0'], signer: SIGNER, reason: 'Broken.' },
    ],
  };

  it('finds the revocation of the same ID, signer and version', () => {
    expect(revocationOf(index, 'org.example.bad', SIGNER, '9.9.9')?.reason).toBe(
      'Sent chats away.',
    );
    expect(revocationOf(index, 'org.example.some', SIGNER, '1.0.0')?.reason).toBe('Broken.');
  });

  it('pulls nothing for another version, ID or signer', () => {
    expect(revocationOf(index, 'org.example.some', SIGNER, '1.0.1')).toBeUndefined();
    expect(revocationOf(index, 'org.example.good', SIGNER, '1.0.0')).toBeUndefined();
    const other = Array.from({ length: 32 }, () => 'cd').join(':');
    expect(revocationOf(index, 'org.example.bad', other, '1.0.0')).toBeUndefined();
  });
});

describe('readMarketplaceIndex', () => {
  const NOW = new Date('2026-11-01T00:00:00.000Z');
  const text = (index: object) => JSON.stringify(index);

  it('reads a current index', () => {
    expect(readMarketplaceIndex(text(INDEX), NOW)).toEqual({ status: 'ready', index: INDEX });
  });

  it.each(['not json', '{}', text({ ...INDEX, format: 1 })])('refuses what is no index', (bad) => {
    expect(readMarketplaceIndex(bad, NOW)).toEqual({ status: 'invalid' });
  });

  it.each([
    ['has expired', { expires: '2026-10-31T23:59:59.000Z' }],
    ['was signed over a day ahead', { generated: '2026-11-02T00:00:01.000Z' }],
    [
      'is valid for over 30 days',
      { expires: '2026-11-26T09:00:00.001Z', generated: '2026-10-27T09:00:00.000Z' },
    ],
  ])('calls an index outdated that %s', (_case, change) => {
    expect(readMarketplaceIndex(text({ ...INDEX, ...change }), NOW)).toEqual({
      status: 'outdated',
    });
  });

  it('allows a clock up to a day behind the signer', () => {
    const ahead = {
      ...INDEX,
      generated: '2026-11-02T00:00:00.000Z',
      expires: '2026-11-20T00:00:00.000Z',
    };
    expect(readMarketplaceIndex(text(ahead), NOW).status).toBe('ready');
  });
});
