import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MarketplaceIndex } from '@yapyap/plugin-sdk';
import { signIndex } from '@yapyap/plugin-sign';
import { describe, expect, it, vi } from 'vitest';
import type { PluginRecord, PluginRecords } from '../plugins/records.ts';
import { marketplaceHandlers, type MarketplaceDependencies } from './chrome.ts';

const key = generateKeyPairSync('ed25519');
const SIGNER = Array.from({ length: 32 }, () => 'ab').join(':');
const CALL = { sender: {} };

const INDEX: MarketplaceIndex = {
  format: 1,
  serial: 1_793_000_000,
  generated: new Date(Date.now() - 60_000).toISOString(),
  expires: new Date(Date.now() + 86_400_000).toISOString(),
  plugins: [
    {
      id: 'org.example.hello',
      name: 'Hello',
      summary: 'Says hello.',
      author: { name: 'Example' },
      homepage: 'https://example.org',
      license: 'MIT',
      review: 'reviewed',
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

const installed = (id: string, extra: Partial<PluginRecord> = {}): [string, PluginRecord] => [
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
  records: PluginRecords = new Map([installed('org.example.other')]),
) {
  // A fresh profile has no plugins folder until something is installed.
  const root = join(mkdtempSync(join(tmpdir(), 'yapyap-marketplace-')), 'plugins');
  const bytes = new TextEncoder().encode(JSON.stringify(index));
  const signature = new TextEncoder().encode(signIndex(bytes, key.privateKey));
  const deps: MarketplaceDependencies = {
    source: {
      indexUrl: 'https://packages.example/index.json',
      signatureUrl: 'https://packages.example/index.json.sig',
      archiveUrl: (id, version) => `https://packages.example/${id}-${version}`,
      anchors: [key.publicKey.export({ format: 'pem', type: 'spki' })],
    },
    appVersion: '0.1.2',
    fetchIndex: vi.fn((url: string) => Promise.resolve(url.endsWith('.sig') ? signature : bytes)),
    fetchArchive: vi.fn(() => Promise.resolve(undefined)),
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
    const list = t.handler('plugins:marketplace');
    expect(list.accepts([])).toBe(true);
    expect(list.accepts([1])).toBe(false);
    expect(await list.handle(CALL)).toEqual({
      status: 'ready',
      plugins: [expect.objectContaining({ id: 'org.example.hello', action: 'install' })],
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
    expect(await t.handler('plugins:marketplace').handle(CALL)).toEqual({
      status: 'outdated',
      plugins: [],
    });
    for (const text of ['{', JSON.stringify({ serial: 'many' })]) {
      writeFileSync(join(t.root, '.marketplace.json'), text);
      expect(await t.handler('plugins:marketplace').handle(CALL)).toMatchObject({
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
    expect(await t.handler('plugins:marketplace').handle(CALL)).toEqual({
      status: 'ready',
      plugins: [
        expect.objectContaining({ id: 'org.example.hello', installed: '0.9.0', action: 'update' }),
      ],
    });
    expect(t.deps.pull).toHaveBeenCalledExactlyOnceWith([
      { id: 'org.example.bad', reason: 'Sent chats away.' },
    ]);
  });

  it('says why there is no list', async () => {
    const t = setup({ ...INDEX, format: 2 });
    expect(await t.handler('plugins:marketplace').handle(CALL)).toEqual({
      status: 'invalid',
      plugins: [],
    });
  });

  it('installs a listed plugin by its ID only, downloading from the marketplace', async () => {
    const t = setup();
    const install = t.handler('plugins:install-listed');
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
