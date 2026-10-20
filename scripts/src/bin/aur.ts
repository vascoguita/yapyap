import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pkgbuild, srcinfo, type AurRelease } from '../release/aur.ts';

// Usage: aur.ts <version> <amd64 .deb> <arm64 .deb> <output directory>
const [version, x86_64, aarch64, output] = process.argv.slice(2).map(String);
const root = join(import.meta.dirname, '..', '..', '..');
const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const source = (path: string) => ({ fileName: basename(path), sha256: sha256(path) });

const release: AurRelease = {
  version: String(version),
  licenseSha256: sha256(join(root, 'LICENSE')),
  debs: { x86_64: source(String(x86_64)), aarch64: source(String(aarch64)) },
};
writeFileSync(join(String(output), 'PKGBUILD'), pkgbuild(release));
writeFileSync(join(String(output), '.SRCINFO'), srcinfo(release));
console.log(`Wrote PKGBUILD and .SRCINFO for yapyap-bin ${release.version}.`);
