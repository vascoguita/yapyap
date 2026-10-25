const ENTRY = /^\* (.+?) (\(\[.*)$/;
const PULL_REQUEST = /\(\[#\d+\]\(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+\)\)/;
const CLOSES = /, closes (.+)$/;
const ISSUE = /\[#\d+\]\(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+\)/g;

interface Entry {
  readonly text: string;
  readonly refs: string;
}

/** The issue links an entry closes. */
const closedIssues = (refs: string): string[] => CLOSES.exec(refs)?.[1]?.match(ISSUE) ?? [];

/**
 * One line for every entry of a change: the merge commit's, which links the
 * pull request, with every issue any of them closes.
 */
function merged(entries: readonly [Entry, ...Entry[]]): string {
  const chosen = entries.find((entry) => PULL_REQUEST.test(entry.refs)) ?? entries[0];
  const issues = [...new Set(entries.flatMap((entry) => closedIssues(entry.refs)))];
  const closes = issues.length > 0 ? `, closes ${issues.join(', ')}` : '';
  return `* ${chosen.text} ${chosen.refs.replace(CLOSES, '')}${closes}`;
}

/** The section's lines with each change once, in the order they first appear. */
function mergeSection(lines: readonly string[]): string[] {
  const groups = new Map<string, [Entry, ...Entry[]] | string>();
  for (const [index, line] of lines.entries()) {
    const match = ENTRY.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      groups.set(`\u0000${String(index)}`, line);
    } else {
      const entry = { text: match[1], refs: match[2] };
      const group = groups.get(entry.text);
      groups.set(entry.text, Array.isArray(group) ? [...group, entry] : [entry]);
    }
  }
  return [...groups.values()].map((group) => (typeof group === 'string' ? group : merged(group)));
}

/**
 * A release-please changelog with each change listed once (#358). It lists
 * a change for its commit and again for its pull request's merge commit,
 * which takes the pull request's Conventional Commit title (ADR 0007). The
 * merged entry links the pull request and closes every issue either did.
 */
export function mergeDuplicates(changelog: string): string {
  const out: string[] = [];
  let section: string[] = [];
  for (const line of [...changelog.split('\n'), '']) {
    if (line.startsWith('* ')) {
      section.push(line);
    } else {
      out.push(...mergeSection(section), line);
      section = [];
    }
  }
  return out.slice(0, -1).join('\n');
}

/** The few GitHub API calls the release PR's cleanup makes. */
export interface GitHubApi {
  readonly get: (path: string) => Promise<unknown>;
  readonly send: (method: 'POST' | 'PATCH', path: string, body: object) => Promise<unknown>;
}

/** GitHub's REST and GraphQL API through `fetch`, failing on any error answer. */
export function githubApi(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  token: string,
): GitHubApi {
  const call = async (path: string, init: RequestInit): Promise<unknown> => {
    const response = await fetcher(`https://api.github.com/${path}`, {
      ...init,
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`GitHub answered ${String(response.status)} for ${path}.`);
    }
    return response.json();
  };
  return {
    get: (path) => call(path, {}),
    send: (method, path, body) => call(path, { method, body: JSON.stringify(body) }),
  };
}

/** The release PR as release-please's `pr` output describes it. */
export interface ReleasePullRequest {
  readonly number: number;
  readonly headBranchName: string;
}

/** Reads release-please's `pr` output, which must name a pull request and its branch. */
export function parseReleasePullRequest(output: string): ReleasePullRequest {
  const pr = JSON.parse(output || '{}') as Partial<ReleasePullRequest>;
  if (typeof pr.number !== 'number' || typeof pr.headBranchName !== 'string') {
    throw new TypeError('The release PR output names no pull request.');
  }
  return { number: pr.number, headBranchName: pr.headBranchName };
}

const COMMIT = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

/**
 * Lists each change once in the release PR's CHANGELOG.md and body, from
 * which release-please writes the release notes. The commit goes through
 * the GraphQL API, so GitHub signs it, and only onto the branch as it was
 * read. Returns whether anything changed.
 */
export async function mergeReleasePullRequest(
  api: GitHubApi,
  repository: string,
  pr: ReleasePullRequest,
): Promise<boolean> {
  const path = `repos/${repository}/pulls/${String(pr.number)}`;
  const pull = (await api.get(path)) as { body: string | null; head: { sha: string } };
  const file = (await api.get(
    `repos/${repository}/contents/CHANGELOG.md?ref=${encodeURIComponent(pr.headBranchName)}`,
  )) as { content: string };
  const changelog = Buffer.from(file.content, 'base64').toString('utf8');
  const body = pull.body ?? '';
  const [newChangelog, newBody] = [mergeDuplicates(changelog), mergeDuplicates(body)];
  if (newChangelog !== changelog) {
    const additions = [
      { path: 'CHANGELOG.md', contents: Buffer.from(newChangelog).toString('base64') },
    ];
    const input = {
      branch: { repositoryNameWithOwner: repository, branchName: pr.headBranchName },
      message: { headline: 'docs(changelog): list each change once' },
      expectedHeadOid: pull.head.sha,
      fileChanges: { additions },
    };
    await api.send('POST', 'graphql', { query: COMMIT, variables: { input } });
  }
  if (newBody !== body) {
    await api.send('PATCH', path, { body: newBody });
  }
  return newChangelog !== changelog || newBody !== body;
}
