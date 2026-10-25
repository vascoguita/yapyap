import { describe, expect, it, vi } from 'vitest';
import {
  githubApi,
  mergeDuplicates,
  mergeReleasePullRequest,
  parseReleasePullRequest,
  type GitHubApi,
} from './changelog.ts';

const ISSUES = 'https://github.com/vascoguita/yapyap/issues';
const COMMITS = 'https://github.com/vascoguita/yapyap/commit';
const pr = (n: number) => `[#${String(n)}](${ISSUES}/${String(n)})`;
const sha = (s: string) => `[${s}](${COMMITS}/${s})`;

describe('mergeDuplicates', () => {
  it('lists a change once, with its pull request and the issues it closes', () => {
    const changelog = [
      '## 0.1.1 (2026-10-25)',
      '',
      '### Bug Fixes',
      '',
      `* **permissions:** let WhatsApp ask (${sha('aaa1111')}), closes ${pr(363)}`,
      `* **permissions:** let WhatsApp ask (${pr(364)}) (${sha('bbb2222')})`,
      `* **autostart:** keep the login entry (${pr(365)}) (${sha('ccc3333')})`,
      `* **autostart:** keep the login entry (${sha('ddd4444')}), closes ${pr(362)}, ${pr(361)}`,
      '',
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(
      [
        '## 0.1.1 (2026-10-25)',
        '',
        '### Bug Fixes',
        '',
        `* **permissions:** let WhatsApp ask (${pr(364)}) (${sha('bbb2222')}), closes ${pr(363)}`,
        `* **autostart:** keep the login entry (${pr(365)}) (${sha('ccc3333')}), closes ${pr(362)}, ${pr(361)}`,
        '',
      ].join('\n'),
    );
  });

  it('keeps entries that appear once, and lines that are not entries, as they are', () => {
    const changelog = [
      '### Features',
      '',
      `* **docs:** count downloads (${sha('eee5555')})`,
      '* a line without links',
      `* **docs:** count downloads, again (${sha('fff6666')}), closes ${pr(347)}`,
      '',
      '---',
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(changelog);
  });

  it('keeps each section apart, even when two list the same text', () => {
    const changelog = [
      '### Features',
      `* same text (${sha('aaa1111')})`,
      '### Bug Fixes',
      `* same text (${sha('bbb2222')})`,
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(changelog);
  });

  it('merges entries without a pull request into the first, with their issues', () => {
    const changelog = [
      `* **ci:** a change (${sha('aaa1111')}), closes ${pr(1)}`,
      `* **ci:** a change (${sha('bbb2222')}), closes ${pr(2)}`,
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(
      `* **ci:** a change (${sha('aaa1111')}), closes ${pr(1)}, ${pr(2)}`,
    );
  });

  it('does not change a release-please changelog already free of duplicates', () => {
    const changelog = `# Changelog\n\n## 0.1.0\n\n### Features\n\n* **a:** b (${pr(1)}) (${sha('aaa1111')})\n`;
    expect(mergeDuplicates(mergeDuplicates(changelog))).toBe(changelog);
  });
});

describe('githubApi', () => {
  it('calls the API with the token, and fails on an error answer', async () => {
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) =>
      Promise.resolve(
        url.endsWith('/missing')
          ? new Response('{}', { status: 404 })
          : new Response('{"ok":true}', { status: 200 }),
      ),
    );
    const api = githubApi(fetcher, 'secret');
    expect(await api.get('repos/a/b')).toEqual({ ok: true });
    expect(await api.send('PATCH', 'repos/a/b/pulls/1', { body: 'x' })).toEqual({ ok: true });
    expect(fetcher.mock.calls[1]).toEqual([
      'https://api.github.com/repos/a/b/pulls/1',
      {
        method: 'PATCH',
        body: '{"body":"x"}',
        headers: { accept: 'application/vnd.github+json', authorization: 'Bearer secret' },
      },
    ]);
    await expect(api.get('missing')).rejects.toThrow('GitHub answered 404 for missing.');
  });
});

describe('parseReleasePullRequest', () => {
  it("reads the number and branch of release-please's pr output", () => {
    expect(
      parseReleasePullRequest('{"number":360,"headBranchName":"release-please--x","title":"t"}'),
    ).toEqual({ number: 360, headBranchName: 'release-please--x' });
  });

  it.each(['', '{}', '{"number":"360","headBranchName":"b"}', '{"number":360}'])(
    'refuses %j',
    (output) => {
      expect(() => parseReleasePullRequest(output)).toThrow('names no pull request');
    },
  );
});

describe('mergeReleasePullRequest', () => {
  const duplicated = [
    `* **a:** b (${sha('aaa1111')}), closes ${pr(1)}`,
    `* **a:** b (${pr(2)}) (${sha('bbb2222')})`,
  ].join('\n');
  const once = `* **a:** b (${pr(2)}) (${sha('bbb2222')}), closes ${pr(1)}`;

  function fake(changelog: string, body: string | null) {
    const sent: unknown[][] = [];
    const api: GitHubApi = {
      get: (path) =>
        Promise.resolve(
          path.includes('/contents/')
            ? { content: Buffer.from(changelog).toString('base64') }
            : { body, head: { sha: 'head1' } },
        ),
      send: (...call) => {
        sent.push(call);
        return Promise.resolve({});
      },
    };
    return { api, sent };
  }

  it('commits the merged changelog on top of the branch it read, and fixes the body', async () => {
    const { api, sent } = fake(duplicated, `Notes\n${duplicated}`);
    const pr360 = { number: 360, headBranchName: 'release-please--x' };
    expect(await mergeReleasePullRequest(api, 'o/r', pr360)).toBe(true);
    const [commit, patch] = sent as [
      [string, string, { variables: { input: unknown } }],
      unknown[],
    ];
    expect(commit.slice(0, 2)).toEqual(['POST', 'graphql']);
    expect(commit[2].variables.input).toEqual({
      branch: { repositoryNameWithOwner: 'o/r', branchName: 'release-please--x' },
      message: { headline: 'docs(changelog): list each change once' },
      expectedHeadOid: 'head1',
      fileChanges: {
        additions: [{ path: 'CHANGELOG.md', contents: Buffer.from(once).toString('base64') }],
      },
    });
    expect(patch).toEqual(['PATCH', 'repos/o/r/pulls/360', { body: `Notes\n${once}` }]);
  });

  it('changes nothing that already lists each change once', async () => {
    const { api, sent } = fake(once, null);
    expect(await mergeReleasePullRequest(api, 'o/r', { number: 1, headBranchName: 'b' })).toBe(
      false,
    );
    expect(sent).toEqual([]);
  });
});
