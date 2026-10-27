import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_INDEX_URL,
  MARKETPLACE_SIGNATURE_URL,
  marketplaceArchiveName,
  marketplaceArchiveUrl,
  MarketplaceIndexSchema,
  type MarketplaceIndex,
} from './marketplace.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');

const INDEX: MarketplaceIndex = {
  format: 1,
  serial: 1_793_000_000,
  generated: '2026-10-27T09:00:00.000Z',
  expires: '2026-11-26T09:00:00.000Z',
  plugins: [
    {
      id: 'org.guita.yapyap.ai-assistant',
      name: 'AI assistant',
      summary: 'Suggests replies with the model you choose.',
      author: { name: 'YapYap', url: 'https://yapyap.guita.org' },
      homepage: 'https://yapyap.guita.org/guide/ai-assistant',
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
  ],
  revoked: [{ id: 'org.example.bad', versions: '*', signer: SIGNER, reason: 'Sent chats away.' }],
};

describe('MarketplaceIndexSchema', () => {
  it('accepts an index of official and reviewed plugins, and revocations', () => {
    expect(Value.Check(MarketplaceIndexSchema, INDEX)).toBe(true);
    expect(
      Value.Check(MarketplaceIndexSchema, {
        ...INDEX,
        revoked: [{ ...INDEX.revoked[0], versions: ['1.0.0'] }],
      }),
    ).toBe(true);
  });

  const [plugin] = INDEX.plugins;
  const [version] = plugin?.versions ?? [];
  it.each([
    ['another format', { format: 2 }],
    ['a serial below one', { serial: 0 }],
    ['a time that is not one', { generated: 'yesterday' }],
    ['an unknown field', { mirror: 'https://example.org' }],
    ['an unknown review', { plugins: [{ ...plugin, review: 'trusted' }] }],
    ['a short fingerprint', { plugins: [{ ...plugin, signer: 'ab:cd' }] }],
    ['a plugin with no versions', { plugins: [{ ...plugin, versions: [] }] }],
    ['a homepage over HTTP', { plugins: [{ ...plugin, homepage: 'http://example.org' }] }],
    [
      'a hash in another form',
      { plugins: [{ ...plugin, versions: [{ ...version, sha256: 'abc' }] }] },
    ],
    [
      'an archive over 20 MB',
      { plugins: [{ ...plugin, versions: [{ ...version, size: 20 * 1024 * 1024 + 1 }] }] },
    ],
    [
      'a grant with markup',
      { plugins: [{ ...plugin, versions: [{ ...version, hosts: ['<b>'] }] }] },
    ],
    ['a revocation without a reason', { revoked: [{ ...INDEX.revoked[0], reason: '' }] }],
  ])('refuses %s', (_case, change) => {
    expect(Value.Check(MarketplaceIndexSchema, { ...INDEX, ...change })).toBe(false);
  });
});

describe('marketplace addresses', () => {
  it('keeps the index, its signature and every archive on YapYap’s own host', () => {
    expect(MARKETPLACE_INDEX_URL).toBe('https://packages.guita.org/plugins/index.json');
    expect(MARKETPLACE_SIGNATURE_URL).toBe('https://packages.guita.org/plugins/index.json.sig');
    expect(marketplaceArchiveName('org.example.hello', '1.2.0-beta.1')).toBe(
      'org.example.hello-1.2.0-beta.1.yapyap-plugin',
    );
    expect(marketplaceArchiveUrl('org.example.hello', '1.2.0')).toBe(
      'https://packages.guita.org/plugins/org.example.hello/org.example.hello-1.2.0.yapyap-plugin',
    );
  });
});
