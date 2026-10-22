import { describe, expect, it, vi } from 'vitest';
import { createGitHub, type Fetch } from './github.ts';

type Route = [method: string, path: string, status: number, body?: unknown];

function fakeFetch(routes: Route[]) {
  return vi.fn<Fetch>((url, init) => {
    const method = init?.method ?? 'GET';
    const path = url.replace('https://api.github.com', '');
    const route = routes.find(([m, p]) => m === method && p === path);
    if (route === undefined) {
      throw new Error(`Unexpected ${method} ${path}`);
    }
    const [, , status, body] = route;
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  });
}

const REPO = 'vascoguita/yapyap';

function sentBody(fetch: ReturnType<typeof fakeFetch>, call = 0): unknown {
  const body = fetch.mock.calls[call]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('expected a JSON request body');
  }
  return JSON.parse(body);
}

describe('createGitHub', () => {
  it('sends authenticated requests and paginates branch listings', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ name: `b${String(i)}` }));
    const fetch = fakeFetch([
      ['GET', '/repos/org/repo/branches?per_page=100&page=1', 200, full],
      [
        'GET',
        '/repos/org/repo/branches?per_page=100&page=2',
        200,
        [{ name: 'last' }, { other: 1 }],
      ],
    ]);
    const names = await createGitHub('t0k', REPO, fetch).listBranchNames('org/repo');
    expect(names).toHaveLength(101);
    expect(names.at(-1)).toBe('last');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer t0k' });
  });

  it('treats a non-array branch response as empty', async () => {
    const fetch = fakeFetch([
      ['GET', '/repos/org/repo/branches?per_page=100&page=1', 200, { message: 'x' }],
    ]);
    expect(await createGitHub('t', REPO, fetch).listBranchNames('org/repo')).toEqual([]);
  });

  it('reads a branch head and returns undefined for a missing branch', async () => {
    const fetch = fakeFetch([
      ['GET', `/repos/${REPO}/git/ref/heads/master`, 200, { object: { sha: 'abc' } }],
      ['GET', `/repos/${REPO}/git/ref/heads/gone`, 404],
      ['GET', `/repos/${REPO}/git/ref/heads/odd`, 200, null],
    ]);
    const gh = createGitHub('t', REPO, fetch);
    expect(await gh.headOid('master')).toBe('abc');
    expect(await gh.headOid('gone')).toBeUndefined();
    expect(await gh.headOid('odd')).toBeUndefined();
  });

  it('creates and deletes branches', async () => {
    const fetch = fakeFetch([
      ['POST', `/repos/${REPO}/git/refs`, 201, {}],
      ['DELETE', `/repos/${REPO}/git/refs/heads/x`, 204],
    ]);
    const gh = createGitHub('t', REPO, fetch);
    await gh.createBranch('x', 'abc');
    await gh.deleteBranch('x');
    expect(sentBody(fetch)).toEqual({
      ref: 'refs/heads/x',
      sha: 'abc',
    });
  });

  it('finds open pull requests by head branch', async () => {
    const fetch = fakeFetch([
      ['GET', `/repos/${REPO}/pulls?state=open&head=vascoguita:a`, 200, [{ number: 7 }]],
      ['GET', `/repos/${REPO}/pulls?state=open&head=vascoguita:b`, 200, []],
      ['GET', `/repos/${REPO}/pulls?state=open&head=vascoguita:c`, 200, { message: 'x' }],
    ]);
    const gh = createGitHub('t', REPO, fetch);
    expect(await gh.findOpenPullRequest('a')).toBe(7);
    expect(await gh.findOpenPullRequest('b')).toBeUndefined();
    expect(await gh.findOpenPullRequest('c')).toBeUndefined();
  });

  it('commits through the GraphQL API with base64 file contents', async () => {
    const fetch = fakeFetch([['POST', '/graphql', 200, { data: {} }]]);
    await createGitHub('t', REPO, fetch).commit({
      branch: 'x',
      expectedHeadOid: 'abc',
      headline: 'h',
      body: 'b',
      files: [{ path: '.nvmrc', contents: '24\n' }],
    });
    const sent = sentBody(fetch) as {
      variables: { input: unknown };
    };
    expect(sent.variables.input).toEqual({
      branch: { repositoryNameWithOwner: REPO, branchName: 'x' },
      message: { headline: 'h', body: 'b' },
      expectedHeadOid: 'abc',
      fileChanges: {
        additions: [{ path: '.nvmrc', contents: Buffer.from('24\n').toString('base64') }],
      },
    });
  });

  it('raises GraphQL errors', async () => {
    const fetch = fakeFetch([['POST', '/graphql', 200, { errors: [{ message: 'stale head' }] }]]);
    const commit = createGitHub('t', REPO, fetch).commit({
      branch: 'x',
      expectedHeadOid: 'abc',
      headline: 'h',
      body: 'b',
      files: [],
    });
    await expect(commit).rejects.toThrow('stale head');
  });

  it('opens pull requests and validates the response', async () => {
    const ok = fakeFetch([['POST', `/repos/${REPO}/pulls`, 201, { html_url: 'https://x/pull/1' }]]);
    const request = { head: 'x', base: 'master', title: 't', body: 'b' };
    expect(await createGitHub('t', REPO, ok).openPullRequest(request)).toBe('https://x/pull/1');
    const bad = fakeFetch([['POST', `/repos/${REPO}/pulls`, 201, {}]]);
    await expect(createGitHub('t', REPO, bad).openPullRequest(request)).rejects.toThrow(
      'pull request URL',
    );
  });

  it('fails on unexpected HTTP errors, including 404 on writes', async () => {
    const fetch = fakeFetch([
      ['GET', `/repos/${REPO}/git/ref/heads/x`, 500],
      ['POST', `/repos/${REPO}/git/refs`, 404],
    ]);
    const gh = createGitHub('t', REPO, fetch);
    await expect(gh.headOid('x')).rejects.toThrow('failed with 500');
    await expect(gh.createBranch('x', 'abc')).rejects.toThrow('failed with 404');
  });

  it('copes with a repository name without an owner separator', async () => {
    const fetch = fakeFetch([['GET', '/repos//pulls?state=open&head=:a', 200, []]]);
    expect(await createGitHub('t', '', fetch).findOpenPullRequest('a')).toBeUndefined();
  });
});
