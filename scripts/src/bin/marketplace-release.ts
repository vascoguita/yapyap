import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TRUST_ANCHORS } from '../../../packages/extension-sign/src/anchors.ts';
import { anchorFingerprints } from '../../../packages/extension-sign/src/trust.ts';
import { readEntry } from '../marketplace/entries.ts';
import { withRelease } from '../marketplace/release.ts';

// Usage: marketplace-release.ts <extension folder> <signed archive> <tag> <notes file>
// Lists a first-party extension's release in marketplace/extensions/<id>.json,
// for the maintainer to review and merge; merging re-signs the index (ADR 0014).
const [folder = '', archivePath = '', tag = '', notesPath = ''] = process.argv.slice(2);
const json = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const manifest = json(join(folder, 'public', 'manifest.json'));
const pkg = json(join(folder, 'package.json'));
const minYapYap = (pkg['yapyap'] as { minVersion?: unknown } | undefined)?.minVersion;
const id = String(manifest['id']);
if (typeof minYapYap !== 'string') {
  throw new Error(
    `${folder}/package.json names no yapyap.minVersion, the oldest YapYap it runs on.`,
  );
}
const entryPath = join('marketplace', 'extensions', `${id}.json`);
const existing = existsSync(entryPath)
  ? readEntry(json(entryPath), basename(entryPath))
  : undefined;
if (Array.isArray(existing)) {
  throw new Error(`${entryPath} is not a valid entry:\n${existing.join('\n')}`);
}
const [signer = ''] = anchorFingerprints(TRUST_ANCHORS);
const entry = withRelease(
  existing,
  {
    id,
    version: String(manifest['version']),
    tag,
    file: basename(archivePath),
    archive: readFileSync(archivePath),
    minYapYap,
    published: new Date().toISOString(),
    notes: readFileSync(notesPath, 'utf8'),
  },
  {
    summary: String(manifest['description']).slice(0, 300),
    homepage: 'https://yapyap.guita.org/',
    license: typeof pkg['license'] === 'string' ? pkg['license'] : 'MIT',
    signer,
    repository: 'https://github.com/vascoguita/yapyap',
  },
);
const checked = readEntry(entry, basename(entryPath));
if (Array.isArray(checked)) {
  throw new Error(`The new entry for ${id} is not valid:\n${checked.join('\n')}`);
}
mkdirSync(join('marketplace', 'extensions'), { recursive: true });
writeFileSync(entryPath, `${JSON.stringify(checked, null, 2)}\n`);
process.stdout.write(`${entryPath}\n`);
