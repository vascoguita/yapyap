import { describe, expect, it } from 'vitest';
import { latestBaseAppBranch, latestNodeLts } from './versions.ts';

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
