import { createHash } from 'node:crypto';
import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import type { InstallRequest } from '../extensions/install-request.ts';
import type { PreparedInstall } from '../extensions/installer.ts';
import type { MarketplaceState } from './index-client.ts';
import { installListed } from './install.ts';
import type { LatestArchive } from './latest.ts';

const SIGNER = 'ab:cd';
const BYTES = new Uint8Array([1, 2, 3]);
const SHA256 = `sha256-${createHash('sha256').update(BYTES).digest('base64')}`;

const REQUEST: InstallRequest = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.1.0',
  author: { name: 'Example', url: undefined },
  fingerprint: SIGNER,
  firstParty: false,
  developer: false,
  capabilities: ['composer:insert-draft'],
  hosts: [],
};

const archive = { manifest: {}, files: new Map() } as never;
const CONSENT: PreparedInstall = { decision: { kind: 'consent', request: REQUEST }, archive };

type Listed = MarketplaceIndex['extensions'][number];

const EXTENSION: Extract<Listed, { review: 'official' }> = {
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
      version: '1.1.0',
      size: BYTES.length,
      sha256: SHA256,
      capabilities: ['composer:insert-draft'],
      hosts: [],
      minYapYap: '0.1.0',
      published: '2026-10-27T08:00:00.000Z',
    },
  ],
};

const THIRD: Extract<Listed, { review: 'unreviewed' }> = {
  id: 'org.example.hello',
  name: 'Hello',
  summary: 'Says hello.',
  author: { name: 'Example' },
  homepage: 'https://example.org',
  license: 'MIT',
  review: 'unreviewed',
  signer: SIGNER,
  latest: 'https://downloads.example.org/hello/latest.yapyap-extension',
};

const ready = (
  extensions: Listed[] = [EXTENSION],
  revoked: MarketplaceIndex['revoked'] = [],
): MarketplaceState => ({
  status: 'ready',
  index: {
    format: 2,
    serial: 1,
    generated: '2026-10-27T08:00:00.000Z',
    expires: '2026-11-20T08:00:00.000Z',
    extensions,
    revoked,
  },
});

function setup(
  options: {
    state?: MarketplaceState;
    bytes?: Uint8Array | undefined;
    prepared?: PreparedInstall;
    appVersion?: string;
    latest?: LatestArchive;
    installed?: string;
  } = {},
) {
  const deps = {
    load: vi.fn(() => Promise.resolve(options.state ?? ready())),
    appVersion: options.appVersion ?? '0.1.2',
    download: vi.fn(() => Promise.resolve('bytes' in options ? options.bytes : BYTES)),
    archiveUrl: (id: string, version: string) => `https://packages.example/${id}-${version}`,
    latest: vi.fn(() =>
      Promise.resolve(
        options.latest ?? { kind: 'archive' as const, bytes: BYTES, version: '1.1.0' },
      ),
    ),
    installed: vi.fn(() => Promise.resolve(options.installed)),
    prepare: vi.fn(() => Promise.resolve(options.prepared ?? CONSENT)),
    commit: vi.fn(() => Promise.resolve('/extensions/org.example.hello/1.1.0')),
    ask: vi.fn(() => Promise.resolve(true)),
    report: vi.fn(),
  };
  return { deps, run: (id = 'org.example.hello') => installListed(deps, id) };
}

describe('installListed', () => {
  it('downloads the listed archive, asks with the usual consent, and installs it', async () => {
    const t = setup();
    await t.run();
    expect(t.deps.download).toHaveBeenCalledWith(
      'https://packages.example/org.example.hello-1.1.0',
    );
    expect(t.deps.prepare).toHaveBeenCalledWith(BYTES);
    expect(t.deps.ask).toHaveBeenCalledWith(
      expect.objectContaining({ trust: 'third-party', source: null }),
    );
    expect(t.deps.latest).not.toHaveBeenCalled();
    expect(t.deps.commit).toHaveBeenCalledWith(CONSENT);
    expect(t.deps.report).toHaveBeenCalledWith({
      kind: 'installed',
      name: 'Hello',
      version: '1.1.0',
    });
  });

  it('keeps YapYap’s own extensions first-party, and asks nothing of an update that adds nothing', async () => {
    const own = { ...REQUEST, id: 'org.guita.yapyap.hello', firstParty: true };
    const official = { ...EXTENSION, id: own.id };
    const t = setup({
      state: ready([official]),
      prepared: { decision: { kind: 'consent', request: own }, archive },
    });
    await t.run(own.id);
    expect(t.deps.ask).toHaveBeenCalledWith(expect.objectContaining({ trust: 'first-party' }));
    const approved = setup({
      prepared: { decision: { kind: 'approved', request: REQUEST }, archive },
    });
    await approved.run();
    expect(approved.deps.ask).not.toHaveBeenCalled();
    expect(approved.deps.commit).toHaveBeenCalledOnce();
  });

  it.each([
    ['the marketplace cannot be loaded', { state: { status: 'unreachable' } as const }],
    ['the extension is not listed', { state: ready([]) }],
    ['this YapYap is too old for it', { appVersion: '0.0.1' }],
  ])('installs nothing when %s', async (_case, options) => {
    const t = setup(options);
    await t.run();
    expect(t.deps.download).not.toHaveBeenCalled();
    expect(t.deps.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason: 'The marketplace does not list this extension for this version of YapYap.',
    });
  });

  it.each([
    ['a failed download', { bytes: undefined }],
    ['an archive of another size', { bytes: new Uint8Array([1, 2]) }],
    ['an archive with another hash', { bytes: new Uint8Array([1, 2, 4]) }],
    [
      'another extension',
      {
        prepared: {
          ...CONSENT,
          decision: { kind: 'consent', request: { ...REQUEST, id: 'org.example.other' } },
        },
      },
    ],
    [
      'another version',
      {
        prepared: {
          ...CONSENT,
          decision: { kind: 'consent', request: { ...REQUEST, version: '1.0.0' } },
        },
      },
    ],
    [
      'another signer',
      {
        prepared: {
          ...CONSENT,
          decision: { kind: 'consent', request: { ...REQUEST, fingerprint: 'ef:01' } },
        },
      },
    ],
  ] as const)('refuses %s, before asking anything', async (_case, options) => {
    const t = setup(options);
    await t.run();
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(t.deps.commit).not.toHaveBeenCalled();
    expect(t.deps.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason: 'The download does not match what the marketplace lists, so it was not installed.',
    });
  });

  it('reports why the usual checks refused the archive, and a failure', async () => {
    const refused = setup({ prepared: { decision: { kind: 'rejected', reason: 'Too large.' } } });
    await refused.run();
    expect(refused.deps.report).toHaveBeenCalledWith({ kind: 'rejected', reason: 'Too large.' });
    const failing = setup();
    failing.deps.commit.mockRejectedValueOnce(new Error('disk full'));
    await failing.run();
    expect(failing.deps.report).toHaveBeenCalledWith({ kind: 'failed' });
  });
});

describe('installListed for an unreviewed extension', () => {
  const host = 'downloads.example.org';

  it('installs its author’s latest archive, naming their host in the consent window', async () => {
    const t = setup({ state: ready([THIRD]) });
    await t.run();
    expect(t.deps.latest).toHaveBeenCalledWith(THIRD);
    expect(t.deps.download).not.toHaveBeenCalled();
    expect(t.deps.prepare).toHaveBeenCalledWith(BYTES);
    expect(t.deps.ask).toHaveBeenCalledWith(
      expect.objectContaining({ trust: 'third-party', source: host }),
    );
    expect(t.deps.commit).toHaveBeenCalledWith(CONSENT);
  });

  it('installs a newer version over the installed one', async () => {
    const t = setup({ state: ready([THIRD]), installed: '1.0.0' });
    await t.run();
    expect(t.deps.installed).toHaveBeenCalledWith('org.example.hello');
    expect(t.deps.commit).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'an archive it could not download',
      { latest: { kind: 'unreachable' } as const },
      `The extension could not be downloaded from ${host}. Check your connection and try again.`,
    ],
    [
      'an archive signed by another key, or for another extension',
      { latest: { kind: 'mismatch' } as const },
      `The download from ${host} is not this extension signed by the key the marketplace lists for it, so it was not installed.`,
    ],
    [
      'a pulled version',
      {
        state: ready(
          [THIRD],
          [{ id: THIRD.id, versions: ['1.1.0'], signer: SIGNER, reason: 'Broken.' }],
        ),
      },
      `The marketplace pulled the version ${host} serves now, so it was not installed.`,
    ],
    [
      'the version already installed',
      { installed: '1.1.0' },
      `${host} still serves version 1.1.0, which is not newer than the one installed.`,
    ],
    [
      'an older version',
      { installed: '1.2.0' },
      `${host} still serves version 1.1.0, which is not newer than the one installed.`,
    ],
    [
      'an archive whose checked signer is not the listed one',
      {
        prepared: {
          ...CONSENT,
          decision: { kind: 'consent', request: { ...REQUEST, fingerprint: 'ef:01' } },
        } as PreparedInstall,
      },
      'The download does not match what the marketplace lists, so it was not installed.',
    ],
  ])('refuses %s, before asking anything', async (_case, options, reason) => {
    const t = setup({ state: ready([THIRD]), ...options });
    await t.run();
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(t.deps.commit).not.toHaveBeenCalled();
    expect(t.deps.report).toHaveBeenCalledWith({ kind: 'rejected', reason });
  });
});
