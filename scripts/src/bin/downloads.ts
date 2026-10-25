import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { badge, countDownloads, fromGitHub } from '../release/downloads.ts';

// Usage: downloads.ts <site directory>
// Writes downloads.json, which the website shows, and downloads-badge.json,
// which the README's Shields.io badge reads (#347). The counts are GitHub's
// own release statistics; YapYap reports nothing.
const [site] = process.argv.slice(2).map(String);
const releases = [];
for (let page = 1; ; page += 1) {
  const response = await fetch(
    `https://api.github.com/repos/vascoguita/yapyap/releases?per_page=100&page=${String(page)}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub answered ${String(response.status)}.`);
  }
  const listed = fromGitHub(await response.json());
  releases.push(...listed);
  if (listed.length < 100) {
    break;
  }
}
const counts = countDownloads(releases);
writeFileSync(join(String(site), 'downloads.json'), JSON.stringify(counts));
writeFileSync(join(String(site), 'downloads-badge.json'), JSON.stringify(badge(counts)));
console.info(`Counted ${String(counts.total)} downloads.`);
