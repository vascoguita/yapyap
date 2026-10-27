import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { TRUST_ANCHORS } from '../../../packages/plugin-sign/src/anchors.ts';
import { anchorFingerprints } from '../../../packages/plugin-sign/src/trust.ts';
import {
  archiveRedirects,
  buildIndex,
  downloadArchives,
  signMarketplaceIndex,
  sourcesOf,
} from '../marketplace/build.ts';
import { readEntry, readRevocations, type Entry } from '../marketplace/entries.ts';

// Usage: marketplace-index.ts <marketplace directory> [site directory]
// Checks every entry and the archive each lists (ADR 0014). With a site
// directory, it also writes plugins/index.json, signs it with
// PLUGIN_SIGNING_KEY when that is set, and adds the archives' redirects.
const [folder = 'marketplace', site] = process.argv.slice(2);
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const pluginsFolder = join(folder, 'plugins');
const files = existsSync(pluginsFolder)
  ? readdirSync(pluginsFolder).filter((name) => name.endsWith('.json'))
  : [];
const entries: Entry[] = [];
const problems: string[] = [];
for (const file of files) {
  const entry = readEntry(read(join(pluginsFolder, file)), file);
  if (Array.isArray(entry)) {
    problems.push(...entry.map((problem) => `${file}: ${problem}`));
  } else {
    entries.push(entry);
  }
}
const revokedPath = join(folder, 'revoked.json');
const { revoked, problems: revocationProblems } = readRevocations(
  existsSync(revokedPath) ? read(revokedPath) : [],
);
problems.push(...revocationProblems);
if (problems.length > 0) {
  for (const problem of problems) {
    process.stderr.write(`::error::${problem}\n`);
  }
  process.exit(1);
}
const archives = await downloadArchives(sourcesOf(entries), fetch);
const index = buildIndex({
  entries,
  revoked,
  archives,
  anchors: anchorFingerprints(TRUST_ANCHORS),
  now: new Date(),
});
console.info(`Checked ${String(index.plugins.length)} plugins.`);
if (site !== undefined) {
  const out = join(site, 'plugins');
  mkdirSync(out, { recursive: true });
  const bytes = new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(join(out, 'index.json'), bytes);
  const key = process.env['PLUGIN_SIGNING_KEY'] ?? '';
  if (key !== '') {
    writeFileSync(
      join(out, 'index.json.sig'),
      `${signMarketplaceIndex(bytes, key, TRUST_ANCHORS)}\n`,
    );
  }
  appendFileSync(join(site, '_redirects'), `${archiveRedirects(entries)}\n`);
}
