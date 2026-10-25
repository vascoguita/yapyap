import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aptSource,
  CHANNELS,
  channels,
  dnfRepository,
  fromGitHub,
  poolFiles,
  redirects,
} from '../release/repository.ts';

// Usage: package-repository.ts <site directory> < releases.json
// Plans the apt and dnf repositories (#344) from GitHub's list of releases:
// which packages each channel lists, and the files the site serves as they are.
const [site] = process.argv.slice(2).map(String);
const listed = channels(fromGitHub(JSON.parse(readFileSync(0, 'utf8'))));
const plan = join(String(site), '.plan');
mkdirSync(plan, { recursive: true });
const lines = (entries: readonly string[]) => entries.map((entry) => `${entry}\n`).join('');
writeFileSync(
  join(plan, 'files'),
  lines(poolFiles(listed).map(({ tag, file }) => `${tag} ${file}`)),
);
for (const channel of CHANNELS) {
  writeFileSync(join(plan, channel), lines(listed[channel].map(({ tag }) => tag)));
  const suffix = channel === 'stable' ? '' : '-beta';
  writeFileSync(join(String(site), `yapyap${suffix}.sources`), aptSource(channel));
  writeFileSync(join(String(site), `yapyap${suffix}.repo`), dnfRepository(channel));
}
writeFileSync(join(String(site), '_redirects'), redirects());
console.info(
  `Planned ${String(listed.stable.length)} stable and ${String(listed.beta.length)} beta releases.`,
);
