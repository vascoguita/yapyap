import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { changeScope } from '../ci/changes.ts';
import { pullRequestShards } from '../mutation/scope.ts';

// Usage: git diff --name-only <base>...HEAD | ci-changes.ts
// Pushes, merge groups and scheduled runs have no base to compare against,
// so the workflow pipes nothing in and everything runs. MACOS_FILES lists
// the changed files that hold macOS-specific code, one per line; HEAD_REF,
// the pull request's branch, tells a release-please pull request apart.
const lines = (text: string) => text.split('\n').map((line) => line.trim());
const changed = lines(readFileSync(0, 'utf8')).filter((file) => file !== '');
const scope = changeScope(changed, {
  release: (process.env['HEAD_REF'] ?? '').startsWith('release-please--'),
  macOSFiles: new Set(lines(process.env['MACOS_FILES'] ?? '')),
});
// Deleted modules leave nothing to mutate.
const shards = pullRequestShards(changed.filter((file) => existsSync(file)));
const outputs = [
  `code=${String(scope.code)}`,
  `packaging=${scope.packaging}`,
  `macos=${String(scope.macos)}`,
  `renovate=${String(scope.renovate)}`,
  `mutation=${JSON.stringify(shards)}`,
].join('\n');
appendFileSync(process.env['GITHUB_OUTPUT'] ?? '/dev/stdout', `${outputs}\n`);
console.info(outputs);
