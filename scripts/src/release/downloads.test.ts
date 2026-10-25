import { describe, expect, it } from 'vitest';
import { badge, compact, countDownloads, fromGitHub } from './downloads.ts';

describe('countDownloads', () => {
  it('counts installers and packages by format, and releases apart from betas', () => {
    const counts = countDownloads([
      {
        prerelease: false,
        assets: [
          { name: 'YapYap-0.1.0-linux-amd64.deb', downloads: 10 },
          { name: 'YapYap-0.1.0-linux-x86_64.rpm', downloads: 4 },
          { name: 'yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst', downloads: 3 },
          { name: 'YapYap-0.1.0-linux-x86_64.AppImage', downloads: 7 },
          { name: 'yapyap-x86_64.flatpak', downloads: 2 },
          { name: 'YapYap-0.1.0-win-x64-setup.exe', downloads: 20 },
          { name: 'YapYap-0.1.0-mac-universal.dmg', downloads: 5 },
          { name: 'YapYap-0.1.0-mac-universal.zip', downloads: 1 },
        ],
      },
      {
        prerelease: true,
        assets: [
          { name: 'YapYap-0.1.0-beta.1-linux-amd64.deb', downloads: 6 },
          { name: 'latest.yml', downloads: 900 },
          { name: 'latest-linux.yml', downloads: 900 },
          { name: 'YapYap-0.1.0-beta.1-win-x64-setup.exe.blockmap', downloads: 50 },
          { name: 'SHA256SUMS', downloads: 30 },
          { name: 'yapyap-v0.1.0-beta.1-sbom.cdx.json', downloads: 3 },
          { name: 'yapyap-bin.PKGBUILD', downloads: 2 },
        ],
      },
    ]);
    expect(counts).toEqual({
      total: 58,
      releases: 52,
      betas: 6,
      byFormat: {
        deb: 16,
        rpm: 4,
        pacman: 3,
        AppImage: 7,
        Flatpak: 2,
        Windows: 20,
        macOS: 6,
      },
    });
  });

  it('counts nothing before the first release', () => {
    expect(countDownloads([]).total).toBe(0);
  });
});

describe('compact', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1250, '1.2k'],
    [9999, '9.9k'],
    [12_345, '12k'],
    [999_999, '999k'],
    [1_000_000, '1M'],
    [2_560_000, '2.5M'],
  ])('shows %i as %s', (count, shown) => {
    expect(compact(count)).toBe(shown);
  });
});

describe('badge', () => {
  it('is a Shields.io endpoint answer with the total', () => {
    const counts = { total: 1250, releases: 1000, betas: 250, byFormat: {} };
    expect(badge(counts)).toEqual({
      schemaVersion: 1,
      label: 'downloads',
      message: '1.2k',
      color: 'blue',
    });
  });
});

describe('fromGitHub', () => {
  it('reads the assets and their download counts', () => {
    expect(
      fromGitHub([{ prerelease: true, assets: [{ name: 'a.deb', download_count: 3 }] }]),
    ).toEqual([{ prerelease: true, assets: [{ name: 'a.deb', downloads: 3 }] }]);
  });

  it.each([
    {},
    [null],
    [{ prerelease: 'no', assets: [] }],
    [{ prerelease: false, assets: {} }],
    [{ prerelease: false, assets: [null] }],
    [{ prerelease: false, assets: [{ name: 1, download_count: 1 }] }],
    [{ prerelease: false, assets: [{ name: 'a', download_count: 1.5 }] }],
  ])('refuses %j', (answer) => {
    expect(() => fromGitHub(answer)).toThrow('Not a list of GitHub releases.');
  });
});
