import { describe, expect, it } from 'vitest';
import { progressNoteProblems } from './progress-notes.ts';

describe('progressNoteProblems', () => {
  it('passes notes named by the issue they cite first', () => {
    expect(
      progressNoteProblems([
        { name: '5.md', content: 'First (#5, #900): a note that wraps\nonto a second line.\n' },
        {
          name: '12.md',
          content: 'Second (C46 in ADR 0008, #12): not page#3 or #4a.\n\nMore (#12).',
        },
      ]),
    ).toEqual([]);
  });

  it.each(['0012.md', '12.txt', 'notes.md', '12-b.md'])('reports the file name %s', (name) => {
    expect(progressNoteProblems([{ name, content: 'Topic (#12): text.' }])).toEqual([
      `${name}: name the note after the issue its pull request closes, as in "123.md".`,
    ]);
  });

  it('reports a note that cites no issue', () => {
    expect(progressNoteProblems([{ name: '7.md', content: 'Topic: see page#3 and #4a.' }])).toEqual(
      ['7.md: the note cites no issue; start it with "Topic (#7): ...".'],
    );
  });

  it('reports a note that cites another issue first', () => {
    expect(progressNoteProblems([{ name: '7.md', content: 'Topic (#8, #7): text.' }])).toEqual([
      '7.md: the note cites #8 first but is named 7.md; name it 8.md or cite #7 first.',
    ]);
  });
});
