import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { reportLatest } from '../marketplace/latest.ts';
import type { PublicNetwork } from '../marketplace/public-fetch.ts';

// Usage: marketplace-latest.ts <entry file>...
// Downloads what each third-party entry's latest address serves and checks
// it against the entry (ADR 0014). CI runs it on the entries a pull request
// adds or changes, so the pull request's author chooses the address:
// `publicGet` only reaches public HTTPS hosts, checks every redirect, and
// caps the download. A wrong archive fails; a server that does not answer
// only warns, since it may be down for a moment.
const TIMEOUT_MS = 60_000;

const network: PublicNetwork = {
  get: (url, init) =>
    fetch(url, {
      ...init,
      signal: AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    }),
  resolve: (host) => lookup(host, { all: true }),
};

const reports = await Promise.all(
  process.argv
    .slice(2)
    .map((path) => reportLatest(JSON.parse(readFileSync(path, 'utf8')), basename(path), network)),
);
for (const { level, message } of reports.flat()) {
  process.stderr.write(`::${level}::${message}\n`);
}
process.exitCode = reports.flat().some(({ level }) => level === 'error') ? 1 : 0;
