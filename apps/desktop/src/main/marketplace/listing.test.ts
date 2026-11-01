import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { describe, expect, it } from 'vitest';
import { FAKE_FINGERPRINT } from '../../../test/extensions.ts';
import { marketplaceEntries, offeredVersion } from './listing.ts';

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

type Listed = MarketplaceIndex['extensions'][number];

const EXTENSION: Extract<Listed, { review: 'official' }> = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example', url: 'https://example.org' },
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'official',
  signer: FAKE_FINGERPRINT,
  versions: [
    version('1.0.0'),
    version('1.2.0', '0.2.0'),
    { ...version('1.1.0'), notes: 'Faster greetings.' },
  ],
};

const THIRD: Extract<Listed, { review: 'unreviewed' }> = {
  id: 'org.example.third',
  name: 'Third',
  summary: 'Made elsewhere.',
  author: { name: 'Someone' },
  homepage: 'https://example.net',
  license: 'MIT',
  review: 'unreviewed',
  signer: FAKE_FINGERPRINT,
  latest: 'https://downloads.example.net/third/latest.yapyap-extension',
};

const index = (
  extensions: Listed[] = [EXTENSION],
  revoked: MarketplaceIndex['revoked'] = [],
): MarketplaceIndex => ({
  format: 2,
  serial: 1,
  generated: '2026-10-27T08:00:00.000Z',
  expires: '2026-11-20T08:00:00.000Z',
  extensions,
  revoked,
});

describe('offeredVersion', () => {
  it('offers the newest version this YapYap runs', () => {
    expect(offeredVersion(index(), EXTENSION, '0.1.2')).toEqual({
      version: { ...version('1.1.0'), notes: 'Faster greetings.' },
      runs: true,
    });
    expect(offeredVersion(index(), EXTENSION, '0.2.0')?.version.version).toBe('1.2.0');
  });

  it('offers the newest version, marked as not running here, when this YapYap is too old', () => {
    expect(offeredVersion(index(), EXTENSION, '0.0.9')).toEqual({
      version: version('1.2.0', '0.2.0'),
      runs: false,
    });
  });

  it('leaves out pulled versions, but only a revocation by the same signer counts', () => {
    const pulled = (versions: '*' | string[], signer = FAKE_FINGERPRINT) =>
      index([EXTENSION], [{ id: EXTENSION.id, versions, signer, reason: 'Broken.' }]);
    expect(offeredVersion(pulled(['1.1.0']), EXTENSION, '0.1.2')?.version.version).toBe('1.0.0');
    expect(offeredVersion(pulled('*'), EXTENSION, '0.1.2')).toBeUndefined();
    expect(offeredVersion(pulled('*', OTHER), EXTENSION, '0.1.2')?.version.version).toBe('1.1.0');
    const elsewhere = index(
      [EXTENSION],
      [{ id: 'org.example.other', versions: '*', signer: FAKE_FINGERPRINT, reason: 'x' }],
    );
    expect(offeredVersion(elsewhere, EXTENSION, '0.1.2')?.version.version).toBe('1.1.0');
  });
});

describe('marketplaceEntries', () => {
  it('lists each extension with what the user can do about it', () => {
    const official = {
      ...EXTENSION,
      id: 'org.guita.yapyap.ai-assistant',
      author: { name: 'YapYap' },
    };
    const newer = { ...EXTENSION, id: 'org.example.newer', versions: [version('2.0.0', '9.0.0')] };
    const gone = { ...EXTENSION, id: 'org.example.gone' };
    const listed = marketplaceEntries(
      index(
        [EXTENSION, official, newer, gone],
        [{ id: gone.id, versions: '*', signer: FAKE_FINGERPRINT, reason: 'Gone.' }],
      ),
      new Map([
        ['org.example.hello', '1.0.0'],
        ['org.guita.yapyap.ai-assistant', '1.1.0'],
      ]),
      '0.1.2',
      new Map(),
    );
    expect(listed).toEqual([
      {
        id: 'org.example.hello',
        name: 'Hello',
        summary: 'Says hello.',
        author: { name: 'Example', url: 'https://example.org' },
        homepage: 'https://example.org/hello',
        review: 'official',
        source: null,
        version: '1.1.0',
        capabilities: ['composer:insert-draft'],
        hosts: [],
        notes: 'Faster greetings.',
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
    expect(marketplaceEntries(index(), new Map(), '0.1.2', new Map())[0]?.action).toBe('install');
  });

  it('lists an unreviewed extension with its author’s host, offering only a newer latest version', () => {
    const entry = (
      installed?: string,
      latest?: string,
      revoked: MarketplaceIndex['revoked'] = [],
    ) =>
      marketplaceEntries(
        index([THIRD], revoked),
        new Map(installed === undefined ? [] : [[THIRD.id, installed]]),
        '0.0.1',
        new Map(latest === undefined ? [] : [[THIRD.id, latest]]),
      );
    expect(entry()).toEqual([
      {
        id: 'org.example.third',
        name: 'Third',
        summary: 'Made elsewhere.',
        author: { name: 'Someone', url: null },
        homepage: 'https://example.net',
        review: 'unreviewed',
        source: 'downloads.example.net',
        version: null,
        capabilities: [],
        hosts: [],
        notes: null,
        installed: null,
        action: 'install',
      },
    ]);
    expect(entry('1.0.0', '1.1.0')[0]).toMatchObject({ version: '1.1.0', action: 'update' });
    expect(entry('1.1.0', '1.1.0')[0]).toMatchObject({ action: 'installed' });
    expect(entry('1.2.0', '1.1.0')[0]).toMatchObject({ action: 'installed' });
    expect(entry('1.0.0')[0]).toMatchObject({ version: null, action: 'installed' });
    const pulled = (versions: '*' | string[]) => [
      { id: THIRD.id, versions, signer: FAKE_FINGERPRINT, reason: 'Broken.' },
    ];
    expect(entry('1.0.0', '1.1.0', pulled(['1.1.0']))[0]).toMatchObject({
      version: null,
      action: 'installed',
    });
    expect(entry('1.0.0', '1.1.0', pulled('*'))).toEqual([]);
  });
});
