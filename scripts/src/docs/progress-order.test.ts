import { describe, expect, it } from 'vitest';
import { progressOrderProblems } from './progress-order.ts';

const page = (...notes: string[]): string =>
  [
    '# Progress',
    '',
    '## Conventions',
    '',
    '- Not a note (#900).',
    '',
    '## Notes',
    '',
    ...notes,
  ].join('\n');

describe('progressOrderProblems', () => {
  it('passes notes in issue-number order, with or without blank lines between them', () => {
    expect(
      progressOrderProblems(
        page(
          '- First (#5, #900): a note that wraps',
          '  onto a second line.',
          '',
          '- Second (#12): keyed by its first issue, not by page#3 or #4a.',
          '- Same issue again (#12): a different note.',
          '- Third (C46 in ADR 0008, #40): cites the issue after other text.',
        ),
      ),
    ).toEqual([]);
  });

  it('reports a page without a notes heading', () => {
    expect(progressOrderProblems('# Progress\n\n- A note (#1).\n')).toEqual([
      'there is no "## Notes" heading.',
    ]);
  });

  it('reports only the misplaced note, and where it belongs', () => {
    expect(
      progressOrderProblems(
        page('- A (#10).', '- B (#20).', '- C (#50).', '- D (#30).', '- E (#40).', '- F (#60).'),
      ),
    ).toEqual([
      'line 11: the note for #50 is out of issue-number order; it belongs after the note for #40.',
    ]);
  });

  it('says a note belongs at the start when it is lower than every ordered note', () => {
    expect(progressOrderProblems(page('- A (#10).', '- B (#20).', '- C (#5).'))).toEqual([
      'line 11: the note for #5 is out of issue-number order; it belongs at the start of the list.',
    ]);
  });

  it('reports exact duplicates, ignoring how they wrap', () => {
    expect(
      progressOrderProblems(
        page('- A (#10): same', '  words.', '- B (#20).', '', '- A (#10): same words.'),
      ),
    ).toEqual(['line 13: this note repeats the one on line 9; remove one of them.']);
  });

  it('reports a note that cites no issue number', () => {
    expect(progressOrderProblems(page('- A (#10).', '- No issue here.', '- B (#20).'))).toEqual([
      'line 10: this note cites no issue number; start it with the issue it closes, as in "Topic (#123): ...".',
    ]);
  });

  it.each([
    ['the next level-two heading', '## Later'],
    ['a horizontal rule', '---'],
  ])('stops the list at %s', (_, end) => {
    expect(
      progressOrderProblems(page('- A (#10).', end, '- Earlier (#1).', '- No issue.')),
    ).toEqual([]);
  });

  it('reports every problem in line order', () => {
    expect(
      progressOrderProblems(page('- B (#20).', '- A (#10).', '- No issue.', '- B (#20).')),
    ).toEqual([
      'line 10: the note for #10 is out of issue-number order; it belongs at the start of the list.',
      'line 11: this note cites no issue number; start it with the issue it closes, as in "Topic (#123): ...".',
      'line 12: this note repeats the one on line 9; remove one of them.',
    ]);
  });

  it('ignores text before the first bullet', () => {
    expect(progressOrderProblems(page('Some text first.', '- A (#10).'))).toEqual([]);
  });
});
