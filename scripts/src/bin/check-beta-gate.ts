import { readFileSync } from 'node:fs';
import { checkBetaGate, parseReleases, securityReason } from '../release/beta-gate.ts';

// The release PR carries the version it would release in the manifest.
const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8')) as Record<
  string,
  string
>;
const response = await fetch(
  'https://api.github.com/repos/vascoguita/yapyap/releases?per_page=100',
  {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`,
    },
  },
);
const result = checkBetaGate({
  version: manifest['.'] ?? '',
  releases: parseReleases(await response.json()),
  now: Date.now(),
  securityReason: securityReason(process.env['PULL_REQUEST_BODY'] ?? ''),
});
console.log(result.pass ? result.message : `::error::${result.message}`);
process.exitCode = Number(!result.pass);
