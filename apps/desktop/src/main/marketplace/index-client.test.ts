import { generateKeyPairSync } from 'node:crypto';
import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { signIndex } from '@yapyap/extension-sign';
import { describe, expect, it, vi } from 'vitest';
import { loadMarketplace, type IndexClientDependencies } from './index-client.ts';

const NOW = new Date('2026-10-27T09:00:00.000Z');
const DAY = 86_400_000;

const INDEX: MarketplaceIndex = {
  format: 1,
  serial: 100,
  generated: '2026-10-27T08:00:00.000Z',
  expires: '2026-11-20T08:00:00.000Z',
  extensions: [],
  revoked: [],
};

const key = generateKeyPairSync('ed25519');
const ANCHOR = key.publicKey.export({ format: 'pem', type: 'spki' });
const encode = (text: string) => new TextEncoder().encode(text);

/** The files a server would serve for `index` (as JSON, unless it is raw text), signed by `signer`. */
function served(index: unknown, signer = key.privateKey) {
  const bytes = encode(index instanceof String ? index.valueOf() : JSON.stringify(index));
  return { bytes, signature: encode(`${signIndex(bytes, signer)}\n`) };
}

function setup(files: { bytes?: Uint8Array; signature?: Uint8Array } = served(INDEX), last = 0) {
  const saveSerial = vi.fn(() => Promise.resolve());
  const deps: IndexClientDependencies = {
    indexUrl: 'https://packages.example/extensions/index.json',
    signatureUrl: 'https://packages.example/extensions/index.json.sig',
    anchors: [ANCHOR],
    fetch: vi.fn((url: string) =>
      Promise.resolve(url.endsWith('.sig') ? files.signature : files.bytes),
    ),
    now: () => NOW,
    lastSerial: () => Promise.resolve(last),
    saveSerial,
  };
  return { deps, saveSerial };
}

describe('loadMarketplace', () => {
  it('uses an index a trust anchor signed, and remembers its serial', async () => {
    const t = setup();
    expect(await loadMarketplace(t.deps)).toEqual({ status: 'ready', index: INDEX });
    expect(t.saveSerial).toHaveBeenCalledExactlyOnceWith(100);
    expect(t.deps.fetch).toHaveBeenCalledWith('https://packages.example/extensions/index.json');
  });

  it('accepts the same serial again, and an index signed a little ahead of this clock', async () => {
    expect((await loadMarketplace(setup(served(INDEX), 100).deps)).status).toBe('ready');
    const ahead = { ...INDEX, generated: new Date(NOW.getTime() + DAY).toISOString() };
    expect((await loadMarketplace(setup(served(ahead)).deps)).status).toBe('ready');
  });

  it('says the marketplace is unreachable when either file is missing', async () => {
    const { bytes, signature } = served(INDEX);
    expect(await loadMarketplace(setup({ bytes }).deps)).toEqual({ status: 'unreachable' });
    expect(await loadMarketplace(setup({ signature }).deps)).toEqual({ status: 'unreachable' });
  });

  it.each([
    ['signed by another key', () => served(INDEX, generateKeyPairSync('ed25519').privateKey)],
    [
      'changed after signing',
      () => ({ ...served(INDEX), bytes: encode(JSON.stringify(INDEX) + ' ') }),
    ],
    ['not JSON', () => served(new String('{'))],
    ['not an index', () => served({ ...INDEX, format: 2 })],
    ['larger than 2 MiB', () => served({ ...INDEX, padding: 'x'.repeat(2 * 1024 * 1024) })],
  ])('refuses an index %s, and remembers nothing', async (_case, files) => {
    const t = setup(files());
    expect(await loadMarketplace(t.deps)).toEqual({ status: 'invalid' });
    expect(t.saveSerial).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { expires: '2026-10-27T09:00:00.000Z' }],
    ['signed too far ahead', { generated: new Date(NOW.getTime() + DAY + 1).toISOString() }],
    [
      'valid for more than 30 days',
      { generated: '2026-10-20T08:00:00.000Z', expires: '2026-11-20T08:00:00.001Z' },
    ],
  ])('refuses an index %s', async (_case, change) => {
    const t = setup(served({ ...INDEX, ...change }));
    expect(await loadMarketplace(t.deps)).toEqual({ status: 'outdated' });
    expect(t.saveSerial).not.toHaveBeenCalled();
  });

  it('refuses an index older than one it accepted', async () => {
    const t = setup(served(INDEX), 101);
    expect(await loadMarketplace(t.deps)).toEqual({ status: 'outdated' });
    expect(t.saveSerial).not.toHaveBeenCalled();
  });
});
