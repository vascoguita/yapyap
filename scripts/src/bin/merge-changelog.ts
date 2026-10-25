import {
  githubApi,
  mergeReleasePullRequest,
  parseReleasePullRequest,
} from '../release/changelog.ts';

// Usage: merge-changelog.ts, with GITHUB_TOKEN and RELEASE_PR (release-please's
// `pr` output) set. Lists each change once in the release PR (#358).
const pr = parseReleasePullRequest(process.env['RELEASE_PR'] ?? '');
const api = githubApi(fetch, process.env['GITHUB_TOKEN'] ?? '');
const changed = await mergeReleasePullRequest(api, 'vascoguita/yapyap', pr);
console.info(
  changed
    ? `Release PR #${String(pr.number)} now lists each change once.`
    : `Release PR #${String(pr.number)} already listed each change once.`,
);
