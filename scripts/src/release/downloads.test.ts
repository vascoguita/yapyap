import { describe, expect, it } from 'vitest';
import { badge, compact, countDownloads, fromGitHub, latestDownloads } from './downloads.ts';

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
          // Signatures and delta files named after a package are not the package.
          { name: 'YapYap-0.1.0-beta.1-linux-amd64.deb.sig', downloads: 100 },
          { name: 'YapYap-0.1.0-beta.1-linux-x86_64.rpm.asc', downloads: 100 },
          { name: 'yapyap-bin-0.1.0-1-x86_64.pkg.tar.zst.sig', downloads: 100 },
          { name: 'YapYap-0.1.0-beta.1-linux-x86_64.AppImage.zsync', downloads: 100 },
          { name: 'yapyap-x86_64.flatpak.sig', downloads: 100 },
          { name: 'YapYap-0.1.0-beta.1-mac-universal.zip.blockmap', downloads: 100 },
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
    [10_500, '10k'],
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
    [{ prerelease: false, assets: [{ name: 'a', download_count: 1 }, null] }],
    [{ prerelease: false, assets: [] }, null],
  ])('refuses %j', (answer) => {
    expect(() => fromGitHub(answer)).toThrow('Not a list of GitHub releases.');
  });
});

describe('latestDownloads', () => {
  const BASE = 'https://github.com/vascoguita/yapyap/releases/download/v10.20.30';
  const asset = (name: string, url = `${BASE}/${name}`) => ({ name, browser_download_url: url });
  const stable = (tag_name: string, assets: unknown[] = [], prerelease = false) => ({
    tag_name,
    prerelease,
    draft: false,
    assets,
  });
  const INSTALLERS = {
    windows: 'YapYap-10.20.30-win-x64-setup.exe',
    windowsArm: 'YapYap-10.20.30-win-arm64-setup.exe',
    mac: 'YapYap-10.20.30-mac-universal.dmg',
    deb: 'YapYap-10.20.30-linux-amd64.deb',
    rpm: 'YapYap-10.20.30-linux-x86_64.rpm',
    appImage: 'YapYap-10.20.30-linux-x86_64.AppImage',
    appImageArm: 'YapYap-10.20.30-linux-arm64.AppImage',
    flatpak: 'yapyap-x86_64.flatpak',
  };

  it('links every installer of the newest stable release, passing over look-alike files', () => {
    const names = Object.values(INSTALLERS);
    // Each look-alike comes first, so only an exact match finds the installer.
    const lookAlikes = [...names.map((name) => `${name}.blockmap`), 'old-yapyap-x86_64.flatpak'];
    expect(
      latestDownloads([
        stable('v0.3.0', [], true),
        { ...stable('v0.2.0'), draft: true },
        stable('nightly'),
        stable('release-v0.2.0'),
        stable('v0.2.0-rc.1'),
        stable(
          'v10.20.30',
          [...lookAlikes, ...names].map((name) => asset(name)),
        ),
        stable('v0.1.1'),
      ]),
    ).toStrictEqual({
      version: '10.20.30',
      files: Object.fromEntries(
        Object.entries(INSTALLERS).map(([key, name]) => [key, `${BASE}/${name}`]),
      ),
    });
  });

  it('leaves out an installer linked from elsewhere, or named so a link could break', () => {
    expect(
      latestDownloads([
        stable('v10.20.30', [
          asset(INSTALLERS.deb),
          asset(INSTALLERS.appImage, 'https://example.org/evil.AppImage'),
          { name: 'YapYap 10"-linux-x86_64.rpm', browser_download_url: undefined },
          asset(` ${INSTALLERS.appImageArm}`),
        ]),
      ]),
    ).toStrictEqual({ version: '10.20.30', files: { deb: `${BASE}/${INSTALLERS.deb}` } });
  });

  it.each([{}, [], [null], [{ tag_name: 'v1.0.0', prerelease: false, draft: false, assets: {} }]])(
    'finds no stable release in %j',
    (answer) => {
      expect(latestDownloads(answer)).toBeUndefined();
    },
  );
});
