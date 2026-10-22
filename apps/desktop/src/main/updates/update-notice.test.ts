import { describe, expect, it, vi } from 'vitest';
import {
  isNewer,
  LATEST_RELEASE_API,
  NOTICE_INTERVAL_MS,
  parseLatestRelease,
  releaseFetcher,
  watchForReleases,
} from './update-notice.ts';

describe('isNewer', () => {
  it.each([
    ['0.2.0', '0.1.0'],
    ['1.0.0', '0.9.9'],
    ['0.1.1', '0.1.0'],
    ['0.10.0', '0.9.0'],
    ['0.1.0', '0.1.0-beta.2'],
    ['v0.2.0', '0.1.0'],
    ['99999.0.0', '0.99999.99999'],
  ])('%s is newer than %s', (candidate, current) => {
    expect(isNewer(candidate, current)).toBe(true);
  });

  it.each([
    ['0.1.0', '0.1.0'],
    ['0.1.0', '0.2.0'],
    ['0.1.0-beta.2', '0.1.0'],
    ['0.9.0', '0.10.0'],
    ['1.0', '0.1.0'],
    ['0.2.0', 'development'],
    ['123456.0.0', '0.1.0'],
  ])('%s is not newer than %s', (candidate, current) => {
    expect(isNewer(candidate, current)).toBe(false);
  });
});

describe('parseLatestRelease', () => {
  it('takes the version and builds the release page itself', () => {
    expect(
      parseLatestRelease({
        tag_name: 'v0.2.0',
        draft: false,
        prerelease: false,
        html_url: 'https://evil.example/download',
      }),
    ).toEqual({
      version: '0.2.0',
      url: 'https://github.com/vascoguita/yapyap/releases/tag/v0.2.0',
    });
  });

  it.each([
    null,
    'v0.2.0',
    { tag_name: 1, draft: false, prerelease: false },
    { tag_name: 'v0.2.0', draft: true, prerelease: false },
    { tag_name: 'v0.2.0', draft: false, prerelease: true },
    { tag_name: 'v0.2.0', prerelease: false },
    { tag_name: 'v0.2.0-beta.1', draft: false, prerelease: false },
    { tag_name: 'latest', draft: false, prerelease: false },
  ])('ignores %j', (value) => {
    expect(parseLatestRelease(value)).toBeUndefined();
  });
});

describe('releaseFetcher', () => {
  it('asks GitHub for JSON and returns it', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ tag_name: 'v1.0.0' })));
    await expect(releaseFetcher(fetch)(LATEST_RELEASE_API)).resolves.toEqual({
      tag_name: 'v1.0.0',
    });
    expect(fetch).toHaveBeenCalledWith(LATEST_RELEASE_API, {
      headers: { accept: 'application/vnd.github+json' },
    });
  });

  it('fails on any other status', async () => {
    const fetch = () => Promise.resolve(new Response('rate limited', { status: 403 }));
    await expect(releaseFetcher(fetch)(LATEST_RELEASE_API)).rejects.toThrow('GitHub answered 403.');
  });
});

describe('watchForReleases', () => {
  function setup(policy: 'notify' | 'self-update' | 'system' | 'manual', answers: unknown[]) {
    let tick: (() => void) | undefined;
    const deps = {
      policy,
      currentVersion: '0.1.0',
      fetchJson: vi.fn(() => {
        const answer = answers.shift();
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      }),
      every: vi.fn((callback: () => void) => {
        tick = callback;
      }),
      showNotice: vi.fn(),
      warn: vi.fn(),
    };
    watchForReleases(deps);
    return { deps, tick: () => tick?.() };
  }

  const release = (tag: string) => ({ tag_name: tag, draft: false, prerelease: false });
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  it.each(['self-update', 'system', 'manual'] as const)(
    'makes no request at all under the %s policy',
    (policy) => {
      const t = setup(policy, []);
      expect(t.deps.fetchJson).not.toHaveBeenCalled();
      expect(t.deps.every).not.toHaveBeenCalled();
    },
  );

  it('checks now and daily, and tells the user about a new release once', async () => {
    const t = setup('notify', [release('v0.2.0'), release('v0.2.0'), release('v0.3.0')]);
    await flush();
    expect(t.deps.fetchJson).toHaveBeenCalledWith(LATEST_RELEASE_API);
    expect(t.deps.every).toHaveBeenCalledWith(expect.any(Function), NOTICE_INTERVAL_MS);
    expect(t.deps.showNotice).toHaveBeenCalledExactlyOnceWith(
      'YapYap 0.2.0 is available. Click to open its download page.',
      'https://github.com/vascoguita/yapyap/releases/tag/v0.2.0',
    );
    t.tick();
    await flush();
    expect(t.deps.showNotice).toHaveBeenCalledOnce();
    t.tick();
    await flush();
    expect(t.deps.showNotice).toHaveBeenLastCalledWith(
      expect.stringContaining('0.3.0'),
      'https://github.com/vascoguita/yapyap/releases/tag/v0.3.0',
    );
  });

  it('stays quiet when the latest release is not newer or not readable', async () => {
    const t = setup('notify', [release('v0.1.0'), { message: 'Not Found' }]);
    await flush();
    t.tick();
    await flush();
    expect(t.deps.showNotice).not.toHaveBeenCalled();
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('logs a failed check and keeps checking', async () => {
    const t = setup('notify', [new Error('offline'), release('v0.2.0')]);
    await flush();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Could not check for a new YapYap version.',
    );
    t.tick();
    await flush();
    expect(t.deps.showNotice).toHaveBeenCalledOnce();
  });
});
