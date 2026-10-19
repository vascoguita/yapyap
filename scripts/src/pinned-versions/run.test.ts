import { describe, expect, it, vi } from 'vitest';
import type { GitHubPort } from './github.ts';
import { FLATPAK_MANIFEST, NVMRC, ROOT_PACKAGE } from './plan.ts';
import {
  BASEAPP_REPOSITORY,
  BRANCH,
  checkPinnedVersions,
  NODE_INDEX,
  type Dependencies,
} from './run.ts';

const pkg = '{ "engines": { "node": ">=24.22.0" } }';
const manifest = "runtime-version: '26.08'\nbase-version: '26.08'\n";

function fakeGitHub(overrides: Partial<GitHubPort> = {}): GitHubPort {
  return {
    listBranchNames: vi.fn(() => Promise.resolve(['branch/26.08'])),
    headOid: vi.fn((branch: string) =>
      Promise.resolve(branch === 'master' ? 'base-oid' : undefined),
    ),
    createBranch: vi.fn(() => Promise.resolve()),
    deleteBranch: vi.fn(() => Promise.resolve()),
    findOpenPullRequest: vi.fn(() => Promise.resolve(undefined)),
    commit: vi.fn(() => Promise.resolve()),
    openPullRequest: vi.fn(() => Promise.resolve('https://github.com/x/pull/9')),
    ...overrides,
  };
}

function deps(
  index: unknown,
  github = fakeGitHub(),
  files: Record<string, string> = {},
): Dependencies {
  const contents: Record<string, string> = {
    [NVMRC]: '24.22.0\n',
    [ROOT_PACKAGE]: pkg,
    [FLATPAK_MANIFEST]: manifest,
    ...files,
  };
  return {
    github,
    base: 'master',
    readFile: (path) => Promise.resolve(contents[path]),
    fetchJson: vi.fn((url: string) => Promise.resolve(url === NODE_INDEX ? index : null)),
    log: vi.fn(),
  };
}

const current = [{ version: 'v24.22.0', lts: 'Krypton' }];
const newer = [
  { version: 'v24.23.0', lts: 'Krypton' },
  { version: 'v26.0.0', lts: false },
  'junk',
  null,
];

describe('checkPinnedVersions', () => {
  it('reports up-to-date when nothing changed', async () => {
    const d = deps(current);
    expect(await checkPinnedVersions(d)).toBe('up-to-date');
    expect(d.github.listBranchNames).toHaveBeenCalledWith(BASEAPP_REPOSITORY);
    expect(d.github.createBranch).not.toHaveBeenCalled();
  });

  it('ignores a malformed Node.js index', async () => {
    expect(await checkPinnedVersions(deps({ not: 'an array' }))).toBe('up-to-date');
  });

  it('opens a pull request with a signed API commit when a newer version exists', async () => {
    const d = deps(newer);
    expect(await checkPinnedVersions(d)).toBe('opened');
    expect(d.github.createBranch).toHaveBeenCalledWith(BRANCH, 'base-oid');
    expect(d.github.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: BRANCH,
        expectedHeadOid: 'base-oid',
        body: '- Node.js LTS 24.22.0 → 24.23.0',
      }),
    );
    expect(d.github.openPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ head: BRANCH, base: 'master' }),
    );
    expect(d.log).toHaveBeenCalledWith('Opened https://github.com/x/pull/9');
  });

  it('replaces a stale automation branch', async () => {
    const github = fakeGitHub({ headOid: vi.fn(() => Promise.resolve('some-oid')) });
    await checkPinnedVersions(deps(newer, github));
    expect(github.deleteBranch).toHaveBeenCalledWith(BRANCH);
  });

  it('leaves an already open update alone', async () => {
    const github = fakeGitHub({ findOpenPullRequest: vi.fn(() => Promise.resolve(42)) });
    expect(await checkPinnedVersions(deps(newer, github))).toBe('pending');
    expect(github.createBranch).not.toHaveBeenCalled();
  });

  it('fails when the base branch is missing', async () => {
    const github = fakeGitHub({ headOid: vi.fn(() => Promise.resolve(undefined)) });
    await expect(checkPinnedVersions(deps(newer, github))).rejects.toThrow(
      'Base branch master not found',
    );
  });

  it('handles a missing root package.json', async () => {
    const d = deps(newer);
    const readFile = d.readFile;
    const result = await checkPinnedVersions({
      ...d,
      readFile: (p) => (p === ROOT_PACKAGE ? Promise.resolve(undefined) : readFile(p)),
    });
    expect(result).toBe('opened');
  });
});
