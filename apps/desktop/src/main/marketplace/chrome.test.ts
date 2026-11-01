import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { signIndex } from '@yapyap/extension-sign';
import { describe, expect, it, vi } from 'vitest';
import { tempDir } from '../../../../../test/temp-dir.ts';
import { signedArchive, testKey, testManifest, zipArchive } from '../../../test/extensions.ts';
import type { ExtensionRecord, ExtensionRecords } from '../extensions/records.ts';
import { linkInstaller, marketplaceHandlers, type MarketplaceDependencies } from './chrome.ts';

const key = generateKeyPairSync('ed25519');
const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const CALL = { sender: {} };
const NOW = new Date('2026-10-27T09:00:00.000Z');

const THIRD = {
  id: 'org.example.third',
  name: 'Third',
  summary: 'Made elsewhere.',
  author: { name: 'Someone' },
  homepage: 'https://example.net',
  license: 'MIT',
  review: 'unreviewed' as const,
  signer: SIGNER,
  latest: 'https://downloads.example.net/third/latest.yapyap-extension',
};

const INDEX: MarketplaceIndex = {
  format: 2,
  serial: 1_793_000_000,
  generated: '2026-10-27T08:59:00.000Z',
  expires: '2026-10-28T09:00:00.000Z',
  extensions: [
    {
      id: 'org.example.hello',
      name: 'Hello',
      summary: 'Says hello.',
      author: { name: 'Example' },
      homepage: 'https://example.org',
      license: 'MIT',
      review: 'official',
      signer: SIGNER,
      versions: [
        {
          version: '1.0.0',
          size: 3,
          sha256: `sha256-${'A'.repeat(43)}=`,
          capabilities: [],
          hosts: [],
          minYapYap: '0.1.0',
          published: '2026-10-27T08:00:00.000Z',
        },
      ],
    },
  ],
  revoked: [],
};

const installed = (id: string, extra: Partial<ExtensionRecord> = {}): [string, ExtensionRecord] => [
  id,
  {
    id,
    version: '1.0.0',
    fingerprint: SIGNER,
    firstParty: false,
    developer: false,
    capabilities: [],
    hosts: [],
    ...extra,
  },
];

function setup(
  index: unknown = INDEX,
  records: ExtensionRecords = new Map([installed('org.example.other')]),
) {
  // A fresh profile has no extensions folder until something is installed.
  const root = join(tempDir('yapyap-marketplace-'), 'extensions');
  const bytes = new TextEncoder().encode(JSON.stringify(index));
  const signature = new TextEncoder().encode(signIndex(bytes, key.privateKey));
  const deps: MarketplaceDependencies = {
    source: {
      indexUrl: 'https://packages.example/index.json',
      signatureUrl: 'https://packages.example/index.json.sig',
      archiveUrl: (id, version) => `https://packages.example/${id}-${version}`,
      latestUrl: (latest) => latest,
      secure: () => true,
      anchors: [key.publicKey.export({ format: 'pem', type: 'spki' })],
    },
    appVersion: '0.1.2',
    fetchIndex: vi.fn((url: string) => Promise.resolve(url.endsWith('.sig') ? signature : bytes)),
    fetchArchive: vi.fn(() => Promise.resolve(undefined)),
    now: () => NOW,
    fetchLatest: {
      head: vi.fn(() => Promise.resolve(undefined)),
      download: vi.fn(() => Promise.resolve(undefined)),
    },
    root,
    records: vi.fn(() => Promise.resolve(records)),
    pull: vi.fn(() => Promise.resolve()),
    install: { prepare: vi.fn(), commit: vi.fn(), ask: vi.fn(), report: vi.fn() },
  };
  const handlers = marketplaceHandlers(deps);
  const handler = (channel: string) => {
    const found = handlers.find((entry) => entry.channel === channel);
    if (found === undefined) {
      throw new Error(`no handler for ${channel}`);
    }
    return found;
  };
  return { root, deps, handler };
}

describe('marketplaceHandlers', () => {
  it('lists the verified marketplace, and keeps the serial it accepted', async () => {
    const t = setup();
    const list = t.handler('extensions:marketplace');
    expect(list.accepts([])).toBe(true);
    expect(list.accepts([1])).toBe(false);
    expect(await list.handle(CALL)).toEqual({
      status: 'ready',
      extensions: [expect.objectContaining({ id: 'org.example.hello', action: 'install' })],
    });
    expect(JSON.parse(readFileSync(join(t.root, '.marketplace.json'), 'utf8'))).toEqual({
      serial: 1_793_000_000,
    });
    expect(t.deps.pull).not.toHaveBeenCalled();
  });

  it('refuses an index older than the serial it kept, and starts from nothing on a bad file', async () => {
    const t = setup();
    mkdirSync(t.root);
    writeFileSync(join(t.root, '.marketplace.json'), JSON.stringify({ serial: 1_793_000_001 }));
    expect(await t.handler('extensions:marketplace').handle(CALL)).toEqual({
      status: 'outdated',
      extensions: [],
    });
    for (const text of ['{', JSON.stringify({ serial: 'many' })]) {
      writeFileSync(join(t.root, '.marketplace.json'), text);
      expect(await t.handler('extensions:marketplace').handle(CALL)).toMatchObject({
        status: 'ready',
      });
    }
  });

  it('marks and stops installed copies of pulled versions, and lists what is left', async () => {
    const t = setup(
      {
        ...INDEX,
        revoked: [
          { id: 'org.example.bad', versions: '*', signer: SIGNER, reason: 'Sent chats away.' },
        ],
      },
      new Map([installed('org.example.bad'), installed('org.example.hello', { version: '0.9.0' })]),
    );
    expect(await t.handler('extensions:marketplace').handle(CALL)).toEqual({
      status: 'ready',
      extensions: [
        expect.objectContaining({ id: 'org.example.hello', installed: '0.9.0', action: 'update' }),
      ],
    });
    expect(t.deps.pull).toHaveBeenCalledExactlyOnceWith([
      { id: 'org.example.bad', reason: 'Sent chats away.' },
    ]);
  });

  it('looks for a newer release of installed unreviewed extensions only', async () => {
    const t = setup(
      {
        ...INDEX,
        extensions: [...INDEX.extensions, THIRD, { ...THIRD, id: 'org.example.fourth' }],
      },
      new Map([installed('org.example.third')]),
    );
    expect(await t.handler('extensions:marketplace').handle(CALL)).toMatchObject({
      status: 'ready',
      extensions: [
        { id: 'org.example.hello', action: 'install' },
        { id: 'org.example.third', source: 'downloads.example.net', action: 'installed' },
        { id: 'org.example.fourth', action: 'install' },
      ],
    });
    expect(t.deps.fetchLatest.download).toHaveBeenCalledExactlyOnceWith(THIRD.latest);
  });

  it('says why there is no list', async () => {
    const t = setup({ ...INDEX, format: 1 });
    expect(await t.handler('extensions:marketplace').handle(CALL)).toEqual({
      status: 'invalid',
      extensions: [],
    });
  });

  it('installs a listed extension by its ID only, downloading from the marketplace', async () => {
    const t = setup();
    const install = t.handler('extensions:install-listed');
    expect(install.accepts(['org.example.hello'])).toBe(true);
    for (const args of [
      [],
      ['hello'],
      ['https://evil.example/x'],
      [1],
      ['org.example.hello', 'x'],
    ]) {
      expect(install.accepts(args)).toBe(false);
    }
    await install.handle(CALL, 'org.example.hello');
    expect(t.deps.fetchArchive).toHaveBeenCalledWith(
      'https://packages.example/org.example.hello-1.0.0',
    );
    expect(t.deps.install.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason: 'The download does not match what the marketplace lists, so it was not installed.',
    });
  });
});

describe('installing an unreviewed extension', () => {
  it('downloads its latest archive, and refuses what it cannot download', async () => {
    const t = setup({ ...INDEX, extensions: [THIRD] }, new Map([installed('org.example.third')]));
    await t.handler('extensions:install-listed').handle(CALL, 'org.example.third');
    expect(t.deps.fetchLatest.download).toHaveBeenCalledWith(THIRD.latest);
    expect(t.deps.install.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason:
        'The extension could not be downloaded from downloads.example.net. Check your connection and try again.',
    });
  });

  it('compares the latest version with the installed one', async () => {
    const author = testKey();
    const third = { ...THIRD, signer: author.fingerprint };
    const bytes = zipArchive(signedArchive(author, testManifest({ id: third.id })));
    const t = setup(
      { ...INDEX, extensions: [third] },
      new Map([installed(third.id, { fingerprint: author.fingerprint })]),
    );
    vi.mocked(t.deps.fetchLatest.download).mockResolvedValue({ bytes });
    await t.handler('extensions:install-listed').handle(CALL, third.id);
    expect(t.deps.install.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason:
        'downloads.example.net still serves version 1.0.0, which is not newer than the one installed.',
    });
  });
});

describe('linkInstaller', () => {
  it('installs a linked extension from the marketplace, one link at a time', async () => {
    const t = setup();
    let finish: (bytes: Uint8Array | undefined) => void = () => undefined;
    vi.mocked(t.deps.fetchArchive).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const install = linkInstaller(t.deps);
    install('org.example.hello');
    // A burst of links while the first is handled opens nothing more.
    install('org.example.hello');
    install('org.example.other');
    await vi.waitFor(() => {
      expect(t.deps.fetchArchive).toHaveBeenCalledOnce();
    });
    finish(undefined);
    await vi.waitFor(() => {
      expect(t.deps.install.report).toHaveBeenCalledOnce();
    });
    install('org.example.hello');
    await vi.waitFor(() => {
      expect(t.deps.fetchArchive).toHaveBeenCalledTimes(2);
    });
  });
});
