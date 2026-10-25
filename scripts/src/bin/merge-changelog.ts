import {
  findReleasePullRequest,
  githubApi,
  mergeReleasePullRequest,
} from '../release/changelog.ts';

// Usage: merge-changelog.ts, with GITHUB_TOKEN set. Lists each change once in
// the open release PR, if there is one (#358).
const REPOSITORY = 'vascoguita/yapyap';
const api = githubApi(fetch, process.env['GITHUB_TOKEN'] ?? '');
const pr = await findReleasePullRequest(api, REPOSITORY);
const changed = pr !== undefined && (await mergeReleasePullRequest(api, REPOSITORY, pr));
console.info(changed ? 'The release PR now lists each change once.' : 'Nothing to merge.');
