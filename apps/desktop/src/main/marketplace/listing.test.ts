import type { MarketplaceIndex } from '@yapyap/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { marketplaceEntries, offeredVersion } from './listing.ts';

const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const OTHER = Array.from({ length: 32 }, () => 'cd').join(':');

const version = (number: string, minYapYap = '0.1.0') => ({
  version: number,
  size: 100,
  sha256: `sha256-${'A'.repeat(43)}=`,
  capabilities: ['composer:insert-draft'],
  hosts: [],
  minYapYap,
  published: '2026-10-27T08:00:00.000Z',
});

const PLUGIN: MarketplaceIndex['plugins'][number] = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example', url: 'https://example.org' },
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'reviewed',
  signer: SIGNER,
  versions: [version('1.0.0'), version('1.2.0', '0.2.0'), version('1.1.0')],
};

const index = (
  plugins = [PLUGIN],
  revoked: MarketplaceIndex['revoked'] = [],
): MarketplaceIndex => ({
  format: 1,
  serial: 1,
  generated: '2026-10-27T08:00:00.000Z',
  expires: '2026-11-20T08:00:00.000Z',
  plugins,
  revoked,
});

describe('offeredVersion', () => {
  it('offers the newest version this YapYap runs', () => {
    expect(offeredVersion(index(), PLUGIN, '0.1.2')).toEqual({
      version: version('1.1.0'),
      runs: true,
    });
    expect(offeredVersion(index(), PLUGIN, '0.2.0')?.version.version).toBe('1.2.0');
  });

  it('offers the newest version, marked as not running here, when this YapYap is too old', () => {
    expect(offeredVersion(index(), PLUGIN, '0.0.9')).toEqual({
      version: version('1.2.0', '0.2.0'),
      runs: false,
    });
  });

  it('leaves out pulled versions, but only a revocation by the same signer counts', () => {
    const pulled = (versions: '*' | string[], signer = SIGNER) =>
      index([PLUGIN], [{ id: PLUGIN.id, versions, signer, reason: 'Broken.' }]);
    expect(offeredVersion(pulled(['1.1.0']), PLUGIN, '0.1.2')?.version.version).toBe('1.0.0');
    expect(offeredVersion(pulled('*'), PLUGIN, '0.1.2')).toBeUndefined();
    expect(offeredVersion(pulled('*', OTHER), PLUGIN, '0.1.2')?.version.version).toBe('1.1.0');
    const elsewhere = index(
      [PLUGIN],
      [{ id: 'org.example.other', versions: '*', signer: SIGNER, reason: 'x' }],
    );
    expect(offeredVersion(elsewhere, PLUGIN, '0.1.2')?.version.version).toBe('1.1.0');
  });
});

describe('marketplaceEntries', () => {
  it('lists each plugin with what the user can do about it', () => {
    const official = {
      ...PLUGIN,
      id: 'org.guita.yapyap.ai-assistant',
      review: 'official' as const,
      author: { name: 'YapYap' },
    };
    const newer = { ...PLUGIN, id: 'org.example.newer', versions: [version('2.0.0', '9.0.0')] };
    const gone = { ...PLUGIN, id: 'org.example.gone' };
    const listed = marketplaceEntries(
      index(
        [PLUGIN, official, newer, gone],
        [{ id: gone.id, versions: '*', signer: SIGNER, reason: 'Gone.' }],
      ),
      new Map([
        ['org.example.hello', '1.0.0'],
        ['org.guita.yapyap.ai-assistant', '1.1.0'],
      ]),
      '0.1.2',
    );
    expect(listed).toEqual([
      {
        id: 'org.example.hello',
        name: 'Hello',
        summary: 'Says hello.',
        author: { name: 'Example', url: 'https://example.org' },
        homepage: 'https://example.org/hello',
        review: 'reviewed',
        version: '1.1.0',
        capabilities: ['composer:insert-draft'],
        hosts: [],
        installed: '1.0.0',
        action: 'update',
      },
      expect.objectContaining({
        id: 'org.guita.yapyap.ai-assistant',
        review: 'official',
        author: { name: 'YapYap', url: null },
        installed: '1.1.0',
        action: 'installed',
      }),
      expect.objectContaining({ id: 'org.example.newer', installed: null, action: 'incompatible' }),
    ]);
    expect(marketplaceEntries(index(), new Map(), '0.1.2')[0]?.action).toBe('install');
  });
});
