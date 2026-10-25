import { describe, expect, it } from 'vitest';
import {
  aptSource,
  channels,
  dnfRepository,
  fromGitHub,
  pacmanSection,
  poolFiles,
  redirects,
  type RepositoryRelease,
} from './repository.ts';

const release = (tag: string, extra: Partial<RepositoryRelease> = {}): RepositoryRelease => ({
  tag,
  prerelease: tag.includes('-'),
  draft: false,
  assets: [
    `YapYap-${tag.slice(1)}-linux-amd64.deb`,
    `YapYap-${tag.slice(1)}-linux-x86_64.rpm`,
    'SHA256SUMS',
  ],
  ...extra,
});

describe('channels', () => {
  it('lists releases alone in stable, and betas and releases in beta, newest first', () => {
    const listed = channels([
      release('v0.2.0-beta.1'),
      release('v0.1.0'),
      release('v0.1.0-beta.1'),
    ]);
    expect(listed.stable.map(({ tag }) => tag)).toEqual(['v0.1.0']);
    expect(listed.beta.map(({ tag }) => tag)).toEqual(['v0.2.0-beta.1', 'v0.1.0', 'v0.1.0-beta.1']);
    expect(listed.beta[0]?.assets).toEqual([
      'YapYap-0.2.0-beta.1-linux-amd64.deb',
      'YapYap-0.2.0-beta.1-linux-x86_64.rpm',
    ]);
  });

  it('keeps the newest versions only', () => {
    const listed = channels(
      ['v0.4.0', 'v0.3.0', 'v0.2.0', 'v0.1.0'].map((tag) => release(tag)),
      2,
    );
    expect(listed.stable.map(({ tag }) => tag)).toEqual(['v0.4.0', 'v0.3.0']);
    expect(listed.beta.map(({ tag }) => tag)).toEqual(['v0.4.0', 'v0.3.0']);
  });

  it('leaves out drafts, releases without Linux packages, and names that could leave the pool', () => {
    const listed = channels([
      release('v0.3.0', { draft: true }),
      release('v0.2.0', { assets: ['YapYap-0.2.0-mac-universal.dmg'] }),
      release('../v0.1.0'),
      release('v0.1.0', { assets: ['../escape.deb', 'YapYap-0.1.0-linux-arm64.deb'] }),
    ]);
    expect(listed.stable).toEqual([
      release('v0.1.0', { assets: ['YapYap-0.1.0-linux-arm64.deb'] }),
    ]);
  });
});

describe('poolFiles', () => {
  it('lists each package once, with its release', () => {
    expect(poolFiles(channels([release('v0.1.0')]))).toEqual([
      { tag: 'v0.1.0', file: 'YapYap-0.1.0-linux-amd64.deb' },
      { tag: 'v0.1.0', file: 'YapYap-0.1.0-linux-x86_64.rpm' },
    ]);
  });
});

describe('redirects', () => {
  it('sends every package download to its GitHub release, pacman packages one by one', () => {
    const beta = release('v0.2.0-beta.1', {
      assets: [
        'yapyap-bin-0.2.0beta.1-1-x86_64.pkg.tar.zst',
        'YapYap-0.2.0-beta.1-linux-amd64.deb',
      ],
    });
    const stable = release('v0.1.0', { assets: ['yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst'] });
    const download = 'https://github.com/vascoguita/yapyap/releases/download';
    expect(redirects(channels([beta, stable]))).toBe(
      [
        `/pool/:tag/:file ${download}/:tag/:file 302`,
        `/rpm/stable/pool/:tag/:file ${download}/:tag/:file 302`,
        `/rpm/beta/pool/:tag/:file ${download}/:tag/:file 302`,
        `/arch/stable/x86_64/yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst ${download}/v0.1.0/yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst 302`,
        `/arch/beta/x86_64/yapyap-bin-0.2.0beta.1-1-x86_64.pkg.tar.zst ${download}/v0.2.0-beta.1/yapyap-bin-0.2.0beta.1-1-x86_64.pkg.tar.zst 302`,
        `/arch/beta/x86_64/yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst ${download}/v0.1.0/yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst 302`,
        '',
      ].join('\n'),
    );
  });
});

describe('repository files', () => {
  it('gives apt a source that trusts only YapYap’s key', () => {
    expect(aptSource('beta')).toBe(
      [
        'Types: deb',
        'URIs: https://packages.guita.org',
        'Suites: beta',
        'Components: main',
        'Signed-By: /etc/apt/keyrings/yapyap.gpg',
        '',
      ].join('\n'),
    );
  });

  it('gives pacman a section that requires signatures on the database and packages', () => {
    expect(pacmanSection('beta')).toBe(
      [
        '[yapyap]',
        'SigLevel = Required',
        'Server = https://packages.guita.org/arch/beta/$arch',
        '',
      ].join('\n'),
    );
  });

  it('gives dnf a repository for each channel that checks the signed metadata', () => {
    expect(dnfRepository('stable')).toBe(
      [
        '[yapyap]',
        'name=YapYap',
        'baseurl=https://packages.guita.org/rpm/stable',
        'enabled=1',
        'gpgcheck=0',
        'repo_gpgcheck=1',
        'skip_if_unavailable=0',
        'gpgkey=https://packages.guita.org/yapyap.asc',
        '',
      ].join('\n'),
    );
    expect(dnfRepository('beta')).toContain('[yapyap-beta]\nname=YapYap (beta)\n');
    expect(dnfRepository('beta')).toContain('baseurl=https://packages.guita.org/rpm/beta\n');
  });
});

describe('fromGitHub', () => {
  it('reads the releases GitHub lists', () => {
    expect(
      fromGitHub([
        { tag_name: 'v0.1.0', prerelease: false, draft: false, assets: [{ name: 'a.deb' }] },
      ]),
    ).toEqual([{ tag: 'v0.1.0', prerelease: false, draft: false, assets: ['a.deb'] }]);
  });

  it('refuses anything else', () => {
    for (const answer of [
      {},
      [null],
      [{ tag_name: 1, prerelease: false, draft: false, assets: [] }],
      [{ tag_name: 'v1', prerelease: 'no', draft: false, assets: [] }],
      [{ tag_name: 'v1', prerelease: false, draft: 0, assets: [] }],
      [{ tag_name: 'v1', prerelease: false, draft: false, assets: {} }],
      [{ tag_name: 'v1', prerelease: false, draft: false, assets: [{ name: 2 }] }],
    ]) {
      expect(() => fromGitHub(answer)).toThrow('Not a list of GitHub releases.');
    }
  });
});
