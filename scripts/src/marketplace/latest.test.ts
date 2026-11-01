import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  packExtensionFolder,
  signExtensionFolder,
} from '../../../packages/extension-sign/src/extension-folder.ts';
import type { UnreviewedEntry } from './entries.ts';
import { checkLatest, reportLatest } from './latest.ts';
import type { HttpGet, PublicNetwork } from './public-fetch.ts';

const MANIFEST = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.4.0',
  author: { name: 'Example' },
  apiVersion: '^1.0.0',
  entry: 'main.js',
  capabilities: ['composer:insert-draft'],
};

/** A signed archive with `manifest`, and the fingerprint of the key made for it. */
function archive(manifest: object = MANIFEST) {
  const folder = mkdtempSync(join(tmpdir(), 'yapyap-latest-'));
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(folder, 'main.js'), 'export default { activate() {} };');
  const key = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
  const signer = signExtensionFolder(folder, key);
  return { bytes: packExtensionFolder(folder), signer };
}

const entryFor = (signer: string): UnreviewedEntry => ({
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example' },
  homepage: 'https://example.org/hello',
  license: 'MIT',
  review: 'unreviewed',
  signer,
  latest: 'https://downloads.example.org/hello/latest.yapyap-extension',
});

const answer = (status: number, bytes: Uint8Array = new Uint8Array()) =>
  Promise.resolve(new Response(bytes, { status }));

/** The network with `get`, where every host is a public one. */
const on = (get: HttpGet): PublicNetwork => ({
  get,
  resolve: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
});

describe('reportLatest', () => {
  const file = 'org.example.hello.json';

  it('reports a verified archive as a notice, an unreachable one as a warning, and a wrong one as an error', async () => {
    const { bytes, signer } = archive();
    expect(
      await reportLatest(
        entryFor(signer),
        file,
        on(() => answer(200, bytes)),
      ),
    ).toEqual([
      {
        level: 'notice',
        message: `${file}: the latest archive is org.example.hello 1.4.0, signed by its key.`,
      },
    ]);
    expect(
      await reportLatest(
        entryFor(signer),
        file,
        on(() => answer(503)),
      ),
    ).toEqual([{ level: 'warning', message: `${file}: the latest address answered 503.` }]);
    expect(
      await reportLatest(
        entryFor(signer),
        file,
        on(() => answer(404)),
      ),
    ).toEqual([{ level: 'error', message: `${file}: the latest address answered 404.` }]);
  });

  it('reports a malformed entry, and nothing for an official one', async () => {
    const fetcher = vi.fn<HttpGet>();
    expect(await reportLatest({ review: 'unreviewed' }, file, on(fetcher))).toEqual([
      {
        level: 'error',
        message: expect.stringMatching(/^org\.example\.hello\.json: \/: /) as string,
      },
    ]);
    const official = {
      id: 'org.guita.yapyap.hello',
      summary: 'Says hello.',
      homepage: 'https://yapyap.guita.org/',
      license: 'MIT',
      review: 'official',
      signer: Array.from({ length: 32 }, () => 'ab').join(':'),
      versions: [
        {
          version: '1.0.0',
          source:
            'https://github.com/vascoguita/yapyap/releases/download/v1/org.guita.yapyap.hello-1.0.0.yapyap-extension',
          sha256: `sha256-${'A'.repeat(43)}=`,
          minYapYap: '0.1.0',
          published: '2026-10-27T08:00:00.000Z',
        },
      ],
    };
    expect(await reportLatest(official, 'org.guita.yapyap.hello.json', on(fetcher))).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('checkLatest', () => {
  it('reads the version of an archive signed by the entry’s key', async () => {
    const { bytes, signer } = archive();
    const fetcher = vi.fn<HttpGet>(() => answer(200, bytes));
    expect(await checkLatest(entryFor(signer), on(fetcher))).toEqual({
      kind: 'verified',
      version: '1.4.0',
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'https://downloads.example.org/hello/latest.yapyap-extension',
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
  });

  it.each([
    [
      'signed by another key',
      () => ({ ...archive(), signer: archive().signer }),
      'it is signed by',
    ],
    [
      'for another extension',
      () => archive({ ...MANIFEST, id: 'org.example.other' }),
      'another extension',
    ],
    [
      'with a manifest the schema refuses',
      () => archive({ ...MANIFEST, capabilities: ['send'] }),
      'manifest schema',
    ],
  ])('refuses an archive %s', async (_case, make, reason) => {
    const { bytes, signer } = make();
    expect(
      await checkLatest(
        entryFor(signer),
        on(() => answer(200, bytes)),
      ),
    ).toEqual({
      kind: 'invalid',
      reason: expect.stringContaining(reason) as string,
    });
  });

  it('refuses a definite client error at once', async () => {
    const fetcher = vi.fn<HttpGet>(() => answer(404));
    expect(await checkLatest(entryFor('ab'), on(fetcher))).toEqual({
      kind: 'invalid',
      reason: 'the latest address answered 404.',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('refuses an address off the public internet at once, without fetching it', async () => {
    const fetcher = vi.fn<HttpGet>();
    const internal: PublicNetwork = {
      get: fetcher,
      resolve: () => Promise.resolve([{ address: '169.254.169.254', family: 4 }]),
    };
    expect(await checkLatest(entryFor('ab'), internal)).toEqual({
      kind: 'invalid',
      reason: expect.stringContaining('not on the public internet') as string,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('tries three times before calling a server unreachable, and takes a late answer', async () => {
    const down = vi.fn<HttpGet>(() => answer(503));
    expect(await checkLatest(entryFor('ab'), on(down))).toEqual({
      kind: 'unreachable',
      reason: 'the latest address answered 503.',
    });
    expect(down).toHaveBeenCalledTimes(3);
    const offline = vi.fn<HttpGet>(() => Promise.reject(new Error('offline')));
    expect(await checkLatest(entryFor('ab'), on(offline))).toEqual({
      kind: 'unreachable',
      reason: 'the latest address could not be reached.',
    });
    const { bytes, signer } = archive();
    const flaky = vi
      .fn<HttpGet>(() => answer(200, bytes))
      .mockImplementationOnce(() => Promise.reject(new Error('reset')));
    expect(await checkLatest(entryFor(signer), on(flaky))).toEqual({
      kind: 'verified',
      version: '1.4.0',
    });
  });
});
