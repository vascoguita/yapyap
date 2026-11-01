import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  signedArchive,
  testKey,
  testManifest,
  unsignedArchive,
  zipArchive,
} from '../../../test/extensions.ts';
import type { ExtensionRecord } from '../extensions/records.ts';
import type { LatestDownload, LatestFetcher, Validators } from './fetch.ts';
import { latestReleases, signedVersion, type Unreviewed } from './latest.ts';

const AUTHOR = testKey();

const EXTENSION: Unreviewed = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example' },
  homepage: 'https://example.org',
  license: 'MIT',
  review: 'unreviewed',
  signer: AUTHOR.fingerprint,
  latest: 'https://downloads.example.org/hello/latest.yapyap-extension',
};

const archiveOf = (version: string, key = AUTHOR, manifest = {}) =>
  zipArchive(signedArchive(key, testManifest({ version, ...manifest })));

const record = (id: string, fingerprint: string | null = AUTHOR.fingerprint): ExtensionRecord => ({
  id,
  version: '1.0.0',
  fingerprint,
  firstParty: false,
  developer: false,
  capabilities: [],
  hosts: [],
});

const ETAG: Validators = { etag: '"v2"', lastModified: null };

function setup(served: { bytes?: Uint8Array; validators?: Validators } = {}) {
  // A fresh profile has no extensions folder until something is installed.
  const root = join(mkdtempSync(join(tmpdir(), 'yapyap-latest-')), 'extensions');
  const download = (): LatestDownload | undefined =>
    served.bytes === undefined
      ? undefined
      : { bytes: served.bytes, ...(served.validators ? { validators: served.validators } : {}) };
  const fetcher = {
    head: vi.fn<LatestFetcher['head']>(() => Promise.resolve(served.validators)),
    download: vi.fn<LatestFetcher['download']>(() => Promise.resolve(download())),
  };
  const releases = latestReleases({
    root,
    fetcher,
    latestUrl: (latest) => `https://mirror.example/${new URL(latest).pathname}`,
  });
  const records = new Map([[EXTENSION.id, record(EXTENSION.id)]]);
  const seen = () =>
    JSON.parse(readFileSync(join(root, '.marketplace-latest.json'), 'utf8')) as unknown;
  return { root, fetcher, releases, records, seen };
}

describe('signedVersion', () => {
  it('reads the version of the listed extension signed by its listed key', () => {
    expect(signedVersion(archiveOf('2.0.0'), EXTENSION)).toBe('2.0.0');
  });

  it.each([
    ['signed by another key', archiveOf('2.0.0', testKey())],
    ['for another extension', archiveOf('2.0.0', AUTHOR, { id: 'org.example.other' })],
    ['with a manifest YapYap cannot run', archiveOf('2.0.0', AUTHOR, { entry: 'missing.js' })],
    ['unsigned', zipArchive(unsignedArchive(testManifest()))],
    ['not an archive', new Uint8Array([1, 2, 3])],
  ])('refuses an archive %s', (_case, bytes) => {
    expect(signedVersion(bytes, EXTENSION)).toBeUndefined();
  });
});

describe('latestReleases', () => {
  it('downloads the latest archive the first time, and remembers what identified it', async () => {
    const t = setup({ bytes: archiveOf('1.1.0'), validators: ETAG });
    expect(await t.releases.versions([EXTENSION], t.records)).toEqual(
      new Map([[EXTENSION.id, '1.1.0']]),
    );
    expect(t.fetcher.head).not.toHaveBeenCalled();
    expect(t.fetcher.download).toHaveBeenCalledWith(
      'https://mirror.example//hello/latest.yapyap-extension',
    );
    expect(t.seen()).toEqual({ [EXTENSION.latest]: { ...ETAG, version: '1.1.0' } });
  });

  it('asks only HEAD while the file is the one it saw, and downloads it again once it changes', async () => {
    const t = setup({ bytes: archiveOf('1.1.0'), validators: ETAG });
    await t.releases.versions([EXTENSION], t.records);
    t.fetcher.download.mockClear();
    expect(await t.releases.versions([EXTENSION], t.records)).toEqual(
      new Map([[EXTENSION.id, '1.1.0']]),
    );
    expect(t.fetcher.head).toHaveBeenCalledOnce();
    expect(t.fetcher.download).not.toHaveBeenCalled();
    t.fetcher.head.mockResolvedValueOnce({ etag: '"v3"', lastModified: null });
    t.fetcher.download.mockResolvedValueOnce({ bytes: archiveOf('1.2.0') });
    expect(await t.releases.versions([EXTENSION], t.records)).toEqual(
      new Map([[EXTENSION.id, '1.2.0']]),
    );
    // A server that no longer says what identifies the file is downloaded from every time.
    t.fetcher.head.mockResolvedValueOnce(undefined);
    await t.releases.versions([EXTENSION], t.records);
    expect(t.fetcher.download).toHaveBeenCalledTimes(2);
  });

  it('offers nothing it could not download or verify, and looks only at what is installed with this key', async () => {
    const wrong = setup({ bytes: archiveOf('9.0.0', testKey()) });
    expect(await wrong.releases.versions([EXTENSION], wrong.records)).toEqual(new Map());
    const offline = setup();
    expect(await offline.releases.versions([EXTENSION], offline.records)).toEqual(new Map());
    const t = setup({ bytes: archiveOf('1.1.0') });
    const others = new Map([[EXTENSION.id, record(EXTENSION.id, null)]]);
    expect(await t.releases.versions([EXTENSION], others)).toEqual(new Map());
    expect(await t.releases.versions([EXTENSION], new Map())).toEqual(new Map());
    expect(t.fetcher.download).not.toHaveBeenCalled();
  });

  it('starts from nothing when what it saw cannot be read', async () => {
    for (const text of ['{', JSON.stringify({ [EXTENSION.latest]: { etag: 1 } })]) {
      const t = setup({ bytes: archiveOf('1.1.0'), validators: ETAG });
      mkdirSync(t.root);
      writeFileSync(join(t.root, '.marketplace-latest.json'), text);
      await t.releases.versions([EXTENSION], t.records);
      expect(t.fetcher.head).not.toHaveBeenCalled();
      expect(t.fetcher.download).toHaveBeenCalledOnce();
    }
  });

  it('downloads an archive to install, saying why it cannot', async () => {
    const bytes = archiveOf('1.1.0');
    const t = setup({ bytes, validators: ETAG });
    expect(await t.releases.download(EXTENSION)).toEqual({
      kind: 'archive',
      bytes,
      version: '1.1.0',
    });
    expect(t.seen()).toEqual({ [EXTENSION.latest]: { ...ETAG, version: '1.1.0' } });
    expect(await setup().releases.download(EXTENSION)).toEqual({ kind: 'unreachable' });
    const wrong = setup({ bytes: archiveOf('1.1.0', testKey()) });
    expect(await wrong.releases.download(EXTENSION)).toEqual({ kind: 'mismatch' });
  });
});
