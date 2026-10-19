import { describe, expect, it } from 'vitest';
import { findViolations, formatReport, isAllowed } from './check.ts';

describe('isAllowed', () => {
  it.each([
    'MIT',
    'Apache-2.0',
    '(MIT OR GPL-3.0)',
    'MIT AND ISC',
    '(MIT OR Apache-2.0) AND BSD-3-Clause',
  ])('allows %s', (expression) => {
    expect(isAllowed(expression)).toBe(true);
  });

  it.each(['GPL-3.0', 'AGPL-3.0-only', 'MIT AND GPL-2.0', 'SSPL-1.0', 'UNKNOWN', ''])(
    'rejects %s',
    (expression) => {
      expect(isAllowed(expression)).toBe(false);
    },
  );
});

describe('findViolations', () => {
  it('reports every package under a disallowed license', () => {
    const report = {
      MIT: [{ name: 'ok', versions: ['1.0.0'] }],
      'GPL-3.0': [{ name: 'bad', versions: ['2.0.0', 3] }, { versions: 'x' }],
      'AGPL-3.0': 'not-a-list',
    };
    expect(findViolations(report)).toEqual([
      { name: 'bad', versions: ['2.0.0'], license: 'GPL-3.0' },
      { name: '(unknown package)', versions: [], license: 'GPL-3.0' },
    ]);
  });

  it('treats a malformed report as empty', () => {
    expect(findViolations(null)).toEqual([]);
    expect(findViolations({ 'GPL-3.0': [null] })).toEqual([
      { name: '(unknown package)', versions: [], license: 'GPL-3.0' },
    ]);
  });
});

describe('formatReport', () => {
  it('summarizes success and lists violations', () => {
    expect(formatReport([])).toBe('All dependency licenses are compatible with MIT.');
    expect(formatReport([{ name: 'bad', versions: ['1.0.0', '1.1.0'], license: 'GPL-3.0' }])).toBe(
      'Dependencies with licenses incompatible with MIT distribution:\n  bad@1.0.0,1.1.0: GPL-3.0',
    );
  });
});
