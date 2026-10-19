import type { FileChange } from './plan.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface CommitRequest {
  readonly branch: string;
  readonly expectedHeadOid: string;
  readonly headline: string;
  readonly body: string;
  readonly files: readonly FileChange[];
}

interface PullRequestRequest {
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

export interface GitHubPort {
  readonly listBranchNames: (repository: string) => Promise<string[]>;
  readonly headOid: (branch: string) => Promise<string | undefined>;
  readonly createBranch: (branch: string, oid: string) => Promise<void>;
  readonly deleteBranch: (branch: string) => Promise<void>;
  readonly findOpenPullRequest: (branch: string) => Promise<number | undefined>;
  readonly commit: (request: CommitRequest) => Promise<void>;
  readonly openPullRequest: (request: PullRequestRequest) => Promise<string>;
}

const API = 'https://api.github.com';
const PAGE_SIZE = 100;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function strings(values: unknown, key: string): string[] {
  return Array.isArray(values)
    ? values.flatMap((value) => {
        const field = record(value)[key];
        return typeof field === 'string' ? [field] : [];
      })
    : [];
}

type Call = (path: string, method?: string, body?: unknown) => Promise<unknown>;

function createCall(token: string, fetch: Fetch): Call {
  return async (path, method = 'GET', body) => {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && method === 'GET') return undefined;
    if (!response.ok)
      throw new Error(`GitHub ${method} ${path} failed with ${String(response.status)}`);
    return response.status === 204 ? undefined : response.json();
  };
}

function branchLister(call: Call): GitHubPort['listBranchNames'] {
  const list = async (target: string, page: number): Promise<string[]> => {
    const query = `per_page=${String(PAGE_SIZE)}&page=${String(page)}`;
    const names = strings(await call(`/repos/${target}/branches?${query}`), 'name');
    return names.length < PAGE_SIZE ? names : [...names, ...(await list(target, page + 1))];
  };
  return (target) => list(target, 1);
}

function refMethods(
  call: Call,
  repository: string,
): Pick<GitHubPort, 'headOid' | 'createBranch' | 'deleteBranch'> {
  return {
    headOid: async (branch) => {
      const sha = record(
        record(await call(`/repos/${repository}/git/ref/heads/${branch}`))['object'],
      )['sha'];
      return typeof sha === 'string' ? sha : undefined;
    },
    createBranch: async (branch, oid) => {
      await call(`/repos/${repository}/git/refs`, 'POST', {
        ref: `refs/heads/${branch}`,
        sha: oid,
      });
    },
    deleteBranch: async (branch) => {
      await call(`/repos/${repository}/git/refs/heads/${branch}`, 'DELETE');
    },
  };
}

function pullMethods(
  call: Call,
  repository: string,
): Pick<GitHubPort, 'findOpenPullRequest' | 'openPullRequest'> {
  const owner = repository.replace(/\/.*$/, '');
  return {
    findOpenPullRequest: async (branch) => {
      const pulls = await call(`/repos/${repository}/pulls?state=open&head=${owner}:${branch}`);
      const number = Array.isArray(pulls) ? record(pulls[0])['number'] : undefined;
      return typeof number === 'number' ? number : undefined;
    },
    openPullRequest: async (request) => {
      const url = record(await call(`/repos/${repository}/pulls`, 'POST', request))['html_url'];
      if (typeof url !== 'string') throw new Error('GitHub did not return a pull request URL');
      return url;
    },
  };
}

export function createGitHub(token: string, repository: string, fetch: Fetch): GitHubPort {
  const call = createCall(token, fetch);
  return {
    listBranchNames: branchLister(call),
    ...refMethods(call, repository),
    ...pullMethods(call, repository),
    commit: (request) => commitOnBranch(call, repository, request),
  };
}

const COMMIT_MUTATION = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

// Commits created through this mutation are signed by GitHub, which the
// signed-commits ruleset on master requires; a plain git push from CI is not.
async function commitOnBranch(
  call: Call,
  repository: string,
  { branch, expectedHeadOid, headline, body, files }: CommitRequest,
): Promise<void> {
  const input = {
    branch: { repositoryNameWithOwner: repository, branchName: branch },
    message: { headline, body },
    expectedHeadOid,
    fileChanges: {
      additions: files.map(({ path, contents }) => ({
        path,
        contents: Buffer.from(contents).toString('base64'),
      })),
    },
  };
  const result = record(
    await call('/graphql', 'POST', { query: COMMIT_MUTATION, variables: { input } }),
  );
  if (result['errors'] !== undefined)
    throw new Error(`Commit failed: ${JSON.stringify(result['errors'])}`);
}
