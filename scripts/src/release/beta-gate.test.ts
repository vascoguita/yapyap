import { describe, expect, it } from 'vitest';
import { checkBetaGate, parseReleases } from './beta-gate.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);
const beta = (tag: string, daysAgo: number) => ({
  tag,
  prerelease: true,
  publishedAt: NOW - daysAgo * DAY,
});

describe('checkBetaGate', () => {
  it('passes once a beta of the version is published, however recently', () => {
    expect(
      checkBetaGate({
        version: '0.1.0',
        releases: [beta('v0.1.0-beta.1', 9), beta('v0.1.0-beta.2', 0.01)],
      }),
    ).toEqual({
      pass: true,
      message: 'v0.1.0 has a published beta: v0.1.0-beta.1, v0.1.0-beta.2.',
    });
  });

  it.each([
    ['no releases', []],
    ['only betas of other versions', [beta('v0.2.0-beta.1', 9), beta('v0.1.00-beta.1', 9)]],
    ['a tag that only looks like a beta', [beta('v0x1x0-beta.1', 9), beta('v0.1.0-beta.1x', 9)]],
    ['a stable release, not a pre-release', [{ ...beta('v0.1.0-beta.1', 9), prerelease: false }]],
    ['an unpublished draft', [{ ...beta('v0.1.0-beta.1', 9), publishedAt: undefined }]],
  ])('fails with %s', (_, releases) => {
    expect(checkBetaGate({ version: '0.1.0', releases })).toEqual({
      pass: false,
      message:
        'No published v0.1.0-beta.N pre-release exists. Cut a beta first (CONTRIBUTING, Releases).',
    });
  });
});

describe('parseReleases', () => {
  it('keeps the tag, the pre-release flag and when it was published', () => {
    expect(
      parseReleases([
        { tag_name: 'v0.1.0-beta.1', prerelease: true, published_at: '2026-10-29T00:00:00Z' },
        { tag_name: 'v0.1.0-beta.2', prerelease: true, published_at: null },
        { tag_name: 'v0.1.0-beta.3', prerelease: true, published_at: 'soon' },
      ]),
    ).toEqual([
      { tag: 'v0.1.0-beta.1', prerelease: true, publishedAt: Date.UTC(2026, 9, 29) },
      { tag: 'v0.1.0-beta.2', prerelease: true, publishedAt: undefined },
      { tag: 'v0.1.0-beta.3', prerelease: true, publishedAt: undefined },
    ]);
  });

  it.each([
    null,
    {},
    'list',
    [null, { tag_name: 1, prerelease: true }, { tag_name: 'v1', prerelease: 'no' }],
  ])('reads %j as no releases', (value) => {
    expect(parseReleases(value)).toEqual([]);
  });
});
