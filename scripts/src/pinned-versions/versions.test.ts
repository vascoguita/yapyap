import { describe, expect, it } from 'vitest';
import { compareVersions, latestBaseAppBranch, latestNodeLts } from './versions.ts';

describe('compareVersions', () => {
  it.each([
    ['24.10.0', '24.9.0', 1],
    ['v24.9.0', '24.10.0', -1],
    ['26.08', '25.08', 1],
    ['24.1', '24.1.0', 0],
    ['24.1.0', '24.1', 0],
  ])('compares %s with %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

describe('latestNodeLts', () => {
  it('picks the highest LTS release even if a maintenance line shipped later', () => {
    expect(
      latestNodeLts([
        { version: 'v26.1.0', lts: false },
        { version: 'v22.30.0', lts: 'Jod' },
        { version: 'v24.22.0', lts: 'Krypton' },
        { version: 'v24.9.0', lts: 'Krypton' },
      ]),
    ).toBe('24.22.0');
  });

  it('returns undefined when there is no LTS release', () => {
    expect(latestNodeLts([{ version: 'v26.1.0', lts: false }])).toBeUndefined();
  });
});

describe('latestBaseAppBranch', () => {
  it('picks the newest stable branch and ignores update and beta branches', () => {
    expect(
      latestBaseAppBranch([
        'branch/25.08',
        'branch/26.08',
        'update-branch/27.08-abc',
        'beta',
        'branch/stable',
      ]),
    ).toBe('26.08');
  });

  it('returns undefined without stable branches', () => {
    expect(latestBaseAppBranch(['beta'])).toBeUndefined();
  });
});
