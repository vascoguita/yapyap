import { describe, expect, it } from 'vitest';
import { checkBetaGate, MIN_BETA_AGE_DAYS, parseReleases, securityReason } from './beta-gate.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);
const beta = (tag: string, daysAgo: number) => ({
  tag,
  prerelease: true,
  publishedAt: NOW - daysAgo * DAY,
});

describe('checkBetaGate', () => {
  it('passes once the newest beta of the version is old enough', () => {
    expect(MIN_BETA_AGE_DAYS).toBe(3);
    expect(
      checkBetaGate({
        version: '0.1.0',
        releases: [beta('v0.1.0-beta.1', 9), beta('v0.1.0-beta.2', 3)],
        now: NOW,
        securityReason: undefined,
      }),
    ).toEqual({ pass: true, message: 'The newest v0.1.0 beta has been out for 3.0 days.' });
  });

  it('waits while the newest beta is younger than the limit, however old earlier ones are', () => {
    expect(
      checkBetaGate({
        version: '0.1.0',
        releases: [beta('v0.1.0-beta.1', 30), beta('v0.1.0-beta.2', 2.5)],
        now: NOW,
        securityReason: undefined,
      }),
    ).toEqual({
      pass: false,
      message: 'The newest v0.1.0 beta has been out for 2.5 days; a stable release needs 3.',
    });
  });

  it.each([
    ['no releases', []],
    ['only betas of other versions', [beta('v0.2.0-beta.1', 9), beta('v0.1.00-beta.1', 9)]],
    ['a tag that only looks like a beta', [beta('v0x1x0-beta.1', 9), beta('v0.1.0-beta.1x', 9)]],
    ['a stable release, not a pre-release', [{ ...beta('v0.1.0-beta.1', 9), prerelease: false }]],
    ['an unpublished draft', [{ ...beta('v0.1.0-beta.1', 9), publishedAt: undefined }]],
  ])('fails with %s', (_, releases) => {
    expect(
      checkBetaGate({ version: '0.1.0', releases, now: NOW, securityReason: undefined }),
    ).toEqual({
      pass: false,
      message:
        'No published v0.1.0-beta.N pre-release exists. Cut a beta first (CONTRIBUTING, Releases).',
    });
  });

  it('lets a security release skip the wait, but never the beta', () => {
    const fresh = [beta('v0.1.1-beta.1', 0.1)];
    expect(
      checkBetaGate({ version: '0.1.1', releases: fresh, now: NOW, securityReason: 'GHSA-xxxx' }),
    ).toEqual({ pass: true, message: 'Security release, skipping the beta wait: GHSA-xxxx' });
    expect(
      checkBetaGate({ version: '0.1.1', releases: [], now: NOW, securityReason: 'GHSA-xxxx' }).pass,
    ).toBe(false);
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

describe('securityReason', () => {
  it('reads the reason from its own line in the release pull request', () => {
    expect(securityReason('Release notes…\nSecurity release: fixes GHSA-abcd  \nmore')).toBe(
      'fixes GHSA-abcd',
    );
  });

  it.each([
    '',
    'Security release:',
    'Security release:   ',
    'Not a Security release: x',
    'security release: x',
  ])('finds no reason in %j', (body) => {
    expect(securityReason(body)).toBeUndefined();
  });
});
