import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { verifyIndex } from '../../../packages/extension-sign/src/index-signature.ts';
import {
  packExtensionFolder,
  signExtensionFolder,
} from '../../../packages/extension-sign/src/extension-folder.ts';
import {
  archiveRedirects,
  buildIndex,
  downloadArchives,
  signMarketplaceIndex,
  sourcesOf,
  type IndexSources,
} from './build.ts';
import type { Entry } from './entries.ts';

const RELEASES = 'https://github.com/vascoguita/yapyap/releases/download';
const NOW = new Date('2026-10-27T09:00:00.000Z');

/** A key made for this test run only; it is never written anywhere. */
function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    anchor: publicKey.export({ format: 'pem', type: 'spki' }),
  };
}

/** A signed archive of an extension with `manifest`, and the fingerprint that signed it. */
function archive(manifest: object, key = testKey().pem) {
  const folder = mkdtempSync(join(tmpdir(), 'yapyap-marketplace-'));
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(folder, 'main.js'), 'export default { activate() {} };');
  const signer = signExtensionFolder(folder, key);
  const bytes = packExtensionFolder(folder);
  const sha256 = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
  return { bytes, signer, sha256 };
}

const MANIFEST = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example' },
  apiVersion: '^1.0.0',
  entry: 'main.js',
  capabilities: ['composer:insert-draft'],
  network: { hosts: ['api.example.org'] },
};

const source = (id: string, version: string) =>
  `${RELEASES}/extensions/${id}-${version}.yapyap-extension`;

/** An entry for `built`, a version of the hello extension, with everything it needs to build. */
function setup(
  manifest: { readonly id: string } & Record<string, unknown> = MANIFEST,
  entryChange: Partial<Entry> = {},
) {
  const built = archive(manifest);
  const at = source(manifest.id, '1.0.0');
  const entry: Entry = {
    id: 'org.example.hello',
    summary: 'Says hello.',
    homepage: 'https://example.org/hello',
    license: 'MIT',
    review: 'reviewed',
    signer: built.signer,
    versions: [
      {
        version: '1.0.0',
        source: at,
        sha256: built.sha256,
        minYapYap: '0.1.2',
        published: '2026-10-26T08:00:00.000Z',
      },
    ],
    ...entryChange,
  };
  const sources: IndexSources = {
    entries: [entry],
    revoked: [],
    archives: new Map([[at, built.bytes]]),
    anchors: new Set(),
    now: NOW,
  };
  return { built, entry, sources };
}

describe('buildIndex', () => {
  it('lists an entry’s screenshots, checked, and none when it has none', () => {
    const { entry, sources } = setup();
    const shot = { file: 'main.png', caption: 'The main window' };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const index = buildIndex({
      ...sources,
      entries: [{ ...entry, screenshots: [shot] }],
      screenshots: () => png,
    });
    expect(index.extensions[0]?.screenshots).toEqual([
      {
        url: 'https://packages.guita.org/extensions/org.example.hello/screenshots/main.png',
        caption: 'The main window',
      },
    ]);
    expect(() => buildIndex({ ...sources, entries: [{ ...entry, screenshots: [shot] }] })).toThrow(
      'screenshot main.png is not in',
    );
    expect(buildIndex(sources).extensions[0]).not.toHaveProperty('screenshots');
  });

  it('carries what changed in a version into the index, and nothing when an entry says nothing', () => {
    const { entry, sources } = setup();
    const noted = {
      ...entry,
      versions: entry.versions.map((listed) => ({ ...listed, notes: 'First release.' })),
    };
    expect(buildIndex({ ...sources, entries: [noted] }).extensions[0]?.versions[0]?.notes).toBe(
      'First release.',
    );
    expect(buildIndex(sources).extensions[0]?.versions[0]).not.toHaveProperty('notes');
  });

  it('lists each extension as its archive’s manifest describes it, with its hash and size', () => {
    const { built, sources } = setup();
    const revoked = [
      { id: 'org.example.bad', versions: '*' as const, signer: built.signer, reason: 'Gone.' },
    ];
    expect(buildIndex({ ...sources, revoked })).toEqual({
      format: 1,
      serial: 1_793_091_600,
      generated: '2026-10-27T09:00:00.000Z',
      expires: '2026-11-26T09:00:00.000Z',
      extensions: [
        {
          id: 'org.example.hello',
          name: 'Hello',
          summary: 'Says hello.',
          author: { name: 'Example' },
          homepage: 'https://example.org/hello',
          license: 'MIT',
          review: 'reviewed',
          signer: built.signer,
          versions: [
            {
              version: '1.0.0',
              size: built.bytes.length,
              sha256: built.sha256,
              capabilities: ['composer:insert-draft'],
              hosts: ['api.example.org'],
              minYapYap: '0.1.2',
              published: '2026-10-26T08:00:00.000Z',
            },
          ],
        },
      ],
      revoked,
    });
  });

  it('names an extension after its newest version, lists extensions by ID, and allows no hosts', () => {
    const key = testKey().pem;
    const older = archive({ ...MANIFEST, name: 'Hi' }, key);
    const newer = archive({ ...MANIFEST, version: '1.1.0', network: undefined }, key);
    const { entry, sources } = setup();
    const versions = [
      { ...entry.versions[0], sha256: older.sha256 } as Entry['versions'][number],
      {
        ...entry.versions[0],
        version: '1.1.0',
        source: source('org.example.hello', '1.1.0'),
        sha256: newer.sha256,
      } as Entry['versions'][number],
    ];
    const aardvark = setup(
      { ...MANIFEST, id: 'org.example.aardvark' },
      { id: 'org.example.aardvark' },
    );
    const index = buildIndex({
      ...sources,
      entries: [{ ...entry, signer: older.signer, versions }, aardvark.entry],
      archives: new Map([
        [source('org.example.hello', '1.0.0'), older.bytes],
        [source('org.example.hello', '1.1.0'), newer.bytes],
        ...aardvark.sources.archives,
      ]),
    });
    expect(index.extensions.map(({ id }) => id)).toEqual([
      'org.example.aardvark',
      'org.example.hello',
    ]);
    const hello = index.extensions[1];
    expect(hello?.name).toBe('Hello');
    expect(hello?.versions.map(({ hosts }) => hosts)).toEqual([['api.example.org'], []]);
  });

  it('lists an official extension only when a trust anchor signed it', () => {
    const anchor = testKey();
    const id = 'org.guita.yapyap.hello';
    const built = archive({ ...MANIFEST, id }, anchor.pem);
    const entry: Entry = {
      ...setup().entry,
      id,
      review: 'official',
      signer: built.signer,
      versions: [
        {
          ...setup().entry.versions[0],
          source: source(id, '1.0.0'),
          sha256: built.sha256,
        } as Entry['versions'][number],
      ],
    };
    const sources = {
      ...setup().sources,
      entries: [entry],
      archives: new Map([[source(id, '1.0.0'), built.bytes]]),
    };
    expect(() => buildIndex(sources)).toThrow(
      `${id} 1.0.0: an official extension must be signed by a trust anchor.`,
    );
    expect(buildIndex({ ...sources, anchors: new Set([built.signer]) }).extensions).toHaveLength(1);
  });

  it.each([
    [
      'a missing archive',
      (t: ReturnType<typeof setup>) => ({ ...t.sources, archives: new Map() }),
      'its archive could not be downloaded.',
    ],
    [
      'an archive that differs from its hash',
      (t: ReturnType<typeof setup>) => ({
        ...t.sources,
        archives: new Map([[source('org.example.hello', '1.0.0'), archive(MANIFEST).bytes]]),
      }),
      'its archive does not match the listed SHA-256.',
    ],
    [
      'an archive signed by another key',
      (t: ReturnType<typeof setup>) => ({
        ...t.sources,
        entries: [{ ...t.entry, signer: Array.from({ length: 32 }, () => '00').join(':') }],
      }),
      'it is signed by',
    ],
  ])('refuses %s, naming the extension and version', (_case, change, problem) => {
    const t = setup();
    expect(() => buildIndex(change(t))).toThrow(`org.example.hello 1.0.0: ${problem}`);
  });

  it('refuses an archive whose manifest names another extension or version, or breaks the schema', () => {
    for (const manifest of [
      { ...MANIFEST, id: 'org.example.other' },
      { ...MANIFEST, version: '2.0.0' },
    ]) {
      expect(() => buildIndex(setup(manifest).sources)).toThrow(
        'its manifest names another extension or version.',
      );
    }
    expect(() => buildIndex(setup({ ...MANIFEST, capabilities: ['send'] }).sources)).toThrow(
      'its manifest does not match the manifest schema.',
    );
  });

  it('refuses an archive it cannot verify', () => {
    const t = setup();
    const unsigned = zipSync({
      'manifest.json': strToU8(JSON.stringify(MANIFEST)),
      'main.js': strToU8(''),
    });
    const sha256 = `sha256-${createHash('sha256').update(unsigned).digest('base64')}`;
    const entries = [
      { ...t.entry, versions: [{ ...t.entry.versions[0], sha256 } as Entry['versions'][number]] },
    ];
    expect(() =>
      buildIndex({
        ...t.sources,
        entries,
        archives: new Map([[source('org.example.hello', '1.0.0'), unsigned]]),
      }),
    ).toThrow('org.example.hello 1.0.0: The extension is not signed.');
  });

  it('refuses an entry that lists no versions', () => {
    const t = setup();
    expect(() => buildIndex({ ...t.sources, entries: [{ ...t.entry, versions: [] }] })).toThrow(
      'org.example.hello lists no versions.',
    );
  });

  it('refuses to produce an index its own schema would refuse', () => {
    const { sources } = setup();
    const revoked = [
      { id: 'org.example.bad', versions: '*' as const, signer: 'x', reason: 'Gone.' },
    ];
    expect(() => buildIndex({ ...sources, revoked })).toThrow(
      'The built index does not match its schema.',
    );
  });
});

describe('archiveRedirects and sourcesOf', () => {
  it('sends each marketplace address to its release asset, and downloads each source once', () => {
    const { entry } = setup();
    const twice = { ...entry, id: 'org.example.twin' };
    expect(archiveRedirects([entry])).toBe(
      `/extensions/org.example.hello/org.example.hello-1.0.0.yapyap-extension ${source('org.example.hello', '1.0.0')} 302`,
    );
    expect(archiveRedirects([])).toBe('');
    expect(sourcesOf([entry, twice])).toEqual([source('org.example.hello', '1.0.0')]);
  });
});

describe('signMarketplaceIndex', () => {
  it('signs with a trust anchor’s key, and refuses any other key', () => {
    const anchor = testKey();
    const bytes = new TextEncoder().encode('{"format":1}\n');
    const signature = signMarketplaceIndex(bytes, anchor.pem, [anchor.anchor]);
    expect(verifyIndex(bytes, signature, [anchor.anchor])).toBe(true);
    expect(() => signMarketplaceIndex(bytes, testKey().pem, [anchor.anchor])).toThrow(
      'The signing key is not one of YapYap’s trust anchors.',
    );
  });
});

describe('downloadArchives', () => {
  it('keeps each archive it downloaded, and leaves out the ones that failed', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetcher = (url: string) =>
      Promise.resolve({
        ok: url.endsWith('/good'),
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      });
    expect(await downloadArchives(['https://x/good', 'https://x/gone'], fetcher)).toEqual(
      new Map([['https://x/good', bytes]]),
    );
  });
});
