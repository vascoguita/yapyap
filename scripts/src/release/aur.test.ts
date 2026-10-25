import { describe, expect, it } from 'vitest';
import { pkgbuild, pkgverOf, srcinfo, type AurRelease } from './aur.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const RELEASE: AurRelease = {
  version: '10.20.30',
  licenseSha256: A,
  debs: {
    x86_64: { fileName: 'YapYap-10.20.30-linux-amd64.deb', sha256: B },
    aarch64: { fileName: 'YapYap-10.20.30-linux-arm64.deb', sha256: C },
  },
};

const DOWNLOADS = 'https://github.com/vascoguita/yapyap/releases/download/v10.20.30';
const LICENSE = 'https://raw.githubusercontent.com/vascoguita/yapyap/v10.20.30/LICENSE';

describe('pkgbuild', () => {
  it('repackages the Debian packages of the release for both architectures', () => {
    expect(pkgbuild(RELEASE)).toBe(
      [
        '# Maintainer: Vasco Guita <https://github.com/vascoguita>',
        'pkgname=yapyap-bin',
        'pkgver=10.20.30',
        'pkgrel=1',
        "pkgdesc='Desktop client for WhatsApp Web (unofficial)'",
        "arch=('x86_64' 'aarch64')",
        "url='https://yapyap.guita.org/'",
        "license=('MIT')",
        "depends=('alsa-lib' 'gtk3' 'libsecret' 'nss' 'xdg-utils')",
        "provides=('yapyap')",
        "conflicts=('yapyap')",
        "options=('!strip' '!debug')",
        `source=('yapyap-10.20.30-LICENSE::${LICENSE}')`,
        `sha256sums=('${A}')`,
        `source_x86_64=('YapYap-10.20.30-linux-amd64.deb::${DOWNLOADS}/YapYap-10.20.30-linux-amd64.deb')`,
        `sha256sums_x86_64=('${B}')`,
        `source_aarch64=('YapYap-10.20.30-linux-arm64.deb::${DOWNLOADS}/YapYap-10.20.30-linux-arm64.deb')`,
        `sha256sums_aarch64=('${C}')`,
        '',
        'package() {',
        '  bsdtar -xf data.tar.* -C "$pkgdir"',
        '  chmod -R go-w "$pkgdir"',
        '  chmod 4755 "$pkgdir/opt/YapYap/chrome-sandbox"',
        '  install -d "$pkgdir/usr/bin"',
        '  ln -s /opt/YapYap/yapyap "$pkgdir/usr/bin/yapyap"',
        '  install -Dm644 "yapyap-$pkgver-LICENSE" "$pkgdir/usr/share/licenses/yapyap-bin/LICENSE"',
        '}',
        '',
      ].join('\n'),
    );
  });
});

describe('srcinfo', () => {
  it('lists the same metadata in the format makepkg --printsrcinfo prints', () => {
    expect(srcinfo(RELEASE)).toBe(
      [
        'pkgbase = yapyap-bin',
        '\tpkgdesc = Desktop client for WhatsApp Web (unofficial)',
        '\tpkgver = 10.20.30',
        '\tpkgrel = 1',
        '\turl = https://yapyap.guita.org/',
        '\tarch = x86_64',
        '\tarch = aarch64',
        '\tlicense = MIT',
        '\tdepends = alsa-lib',
        '\tdepends = gtk3',
        '\tdepends = libsecret',
        '\tdepends = nss',
        '\tdepends = xdg-utils',
        '\tprovides = yapyap',
        '\tconflicts = yapyap',
        '\toptions = !strip',
        '\toptions = !debug',
        `\tsource = yapyap-10.20.30-LICENSE::${LICENSE}`,
        `\tsha256sums = ${A}`,
        `\tsource_x86_64 = YapYap-10.20.30-linux-amd64.deb::${DOWNLOADS}/YapYap-10.20.30-linux-amd64.deb`,
        `\tsha256sums_x86_64 = ${B}`,
        `\tsource_aarch64 = YapYap-10.20.30-linux-arm64.deb::${DOWNLOADS}/YapYap-10.20.30-linux-arm64.deb`,
        `\tsha256sums_aarch64 = ${C}`,
        '',
        'pkgname = yapyap-bin',
        '',
      ].join('\n'),
    );
  });
});

describe('validation', () => {
  const deb = (fileName: string, sha256 = B) => ({ fileName, sha256 });
  it.each<[string, AurRelease, string]>([
    [
      'an unknown pre-release',
      { ...RELEASE, version: '1.0.0-dev.1' },
      'Not a release version: 1.0.0-dev.1',
    ],
    ['a prefixed version', { ...RELEASE, version: 'v1.0.0' }, 'Not a release version: v1.0.0'],
    ['a short version', { ...RELEASE, version: '1.0' }, 'Not a release version: 1.0'],
    ['a bad license checksum', { ...RELEASE, licenseSha256: 'A'.repeat(64) }, 'Not a SHA-256'],
    [
      'a short deb checksum',
      { ...RELEASE, debs: { ...RELEASE.debs, aarch64: deb('ok.deb', 'c'.repeat(63)) } },
      'Not a SHA-256',
    ],
    [
      'a long deb checksum',
      { ...RELEASE, debs: { ...RELEASE.debs, x86_64: deb('ok.deb', `${B}0`) } },
      'Not a SHA-256',
    ],
    [
      'a file name with a quote',
      { ...RELEASE, debs: { ...RELEASE.debs, x86_64: deb("x'.deb") } },
      "Unsafe file name: x'.deb",
    ],
    [
      'a file name with a path',
      { ...RELEASE, debs: { ...RELEASE.debs, aarch64: deb('../x.deb') } },
      'Unsafe file name: ../x.deb',
    ],
    [
      'a file name with a trailing newline',
      { ...RELEASE, debs: { ...RELEASE.debs, aarch64: deb('x.deb\n') } },
      'Unsafe file name: x.deb',
    ],
  ])('rejects %s', (_, release, message) => {
    expect(() => pkgbuild(release)).toThrow(message);
    expect(() => srcinfo(release)).toThrow(message);
  });
});

describe('pre-releases', () => {
  const beta: AurRelease = {
    ...RELEASE,
    version: '10.20.30-beta.2',
    debs: {
      x86_64: { fileName: 'YapYap-10.20.30-beta.2-linux-amd64.deb', sha256: B },
      aarch64: { fileName: 'YapYap-10.20.30-beta.2-linux-arm64.deb', sha256: C },
    },
  };

  it('get a pacman version that sorts before the release, and download from their own tag', () => {
    expect(pkgverOf('10.20.30-beta.2')).toBe('10.20.30beta.2');
    expect(pkgverOf('10.20.30')).toBe('10.20.30');
    const built = pkgbuild(beta);
    expect(built).toContain('pkgver=10.20.30beta.2\n');
    expect(built).toContain(
      "source=('yapyap-10.20.30beta.2-LICENSE::https://raw.githubusercontent.com/vascoguita/yapyap/v10.20.30-beta.2/LICENSE')",
    );
    expect(built).toContain(
      'YapYap-10.20.30-beta.2-linux-amd64.deb::https://github.com/vascoguita/yapyap/releases/download/v10.20.30-beta.2/YapYap-10.20.30-beta.2-linux-amd64.deb',
    );
    expect(srcinfo(beta)).toContain('\tpkgver = 10.20.30beta.2\n');
  });
});
