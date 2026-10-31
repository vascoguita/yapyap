import {
  findReleasePullRequest,
  githubApi,
  mergeReleasePullRequest,
  RELEASE_TRACKS,
} from '../release/changelog.ts';

// Usage: merge-changelog.ts, with GITHUB_TOKEN set. Lists each change once in
// each open release PR: YapYap's and each extension's (#358, #474).
const REPOSITORY = 'vascoguita/yapyap';
const api = githubApi(fetch, process.env['GITHUB_TOKEN'] ?? '');
for (const track of RELEASE_TRACKS) {
  const pr = await findReleasePullRequest(api, REPOSITORY, track);
  const changed = pr !== undefined && (await mergeReleasePullRequest(api, REPOSITORY, pr));
  console.info(
    `${track.branch}: ${changed ? 'each change is listed once now.' : 'nothing to merge.'}`,
  );
}
