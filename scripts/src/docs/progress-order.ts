/** One top-level bullet of the notes list, with the line it starts on. */
interface Note {
  line: number;
  text: string;
}

interface NumberedNote extends Note {
  issue: number;
}

interface Problem {
  line: number;
  message: string;
}

/** A run of notes in issue-number order, ending at `note`. */
interface Run {
  note: NumberedNote;
  length: number;
  before: Run | undefined;
}

/** The first `#123` a note cites; `page#12` and `#12a` are not issue numbers. */
const ISSUE = /\B#(\d+)\b/;

const endsNotes = (line: string): boolean => line.startsWith('## ') || line.trim() === '---';

/** Splits the lines after `## Notes` into bullets, up to the next `## ` heading or `---` line. */
function notesOf(lines: string[], start: number): Note[] {
  const rest = lines.slice(start);
  const end = rest.findIndex(endsNotes);
  const notes: Note[] = [];
  rest.slice(0, end < 0 ? rest.length : end).forEach((line, index) => {
    const last = notes.at(-1);
    if (line.startsWith('- ')) {
      notes.push({ line: start + index + 1, text: line });
    } else if (last && line.trim() !== '') {
      last.text += `\n${line}`;
    }
  });
  return notes;
}

/** Keeps the first of each exact duplicate and reports the others. */
function withoutDuplicates(notes: Note[], problems: Problem[]): Note[] {
  const seen = new Map<string, Note>();
  for (const note of notes) {
    const key = note.text.replace(/\s+/g, ' ');
    const first = seen.get(key);
    if (first) {
      problems.push({
        line: note.line,
        message: `this note repeats the one on line ${String(first.line)}; remove one of them.`,
      });
    } else {
      seen.set(key, note);
    }
  }
  return [...seen.values()];
}

/** Keeps the notes that cite an issue and reports the others. */
function numbered(notes: Note[], problems: Problem[]): NumberedNote[] {
  return notes.flatMap((note) => {
    const match = ISSUE.exec(note.text);
    if (match) {
      return [{ ...note, issue: Number(match[1]) }];
    }
    problems.push({
      line: note.line,
      message:
        'this note cites no issue number; start it with the issue it closes, as in "Topic (#123): ...".',
    });
    return [];
  });
}

const longer = (first: Run | undefined, second: Run): Run =>
  first && first.length >= second.length ? first : second;

/**
 * The longest run of notes already in issue-number order, so a misplaced
 * note is reported alone rather than with every note after it.
 */
function longestRun(notes: NumberedNote[]): Set<NumberedNote> {
  const runs: Run[] = [];
  for (const note of notes) {
    const before = runs
      .filter((run) => run.note.issue <= note.issue)
      .reduce<Run | undefined>((best, candidate) => longer(best, candidate), undefined);
    runs.push({ note, length: (before?.length ?? 0) + 1, before });
  }
  const kept = new Set<NumberedNote>();
  for (
    let run = runs.reduce<Run | undefined>((best, candidate) => longer(best, candidate), undefined);
    run;
    run = run.before
  ) {
    kept.add(run.note);
  }
  return kept;
}

/** Reports the notes outside the longest ordered run, saying where each belongs. */
function outOfOrder(notes: NumberedNote[]): Problem[] {
  const kept = longestRun(notes);
  const anchors = notes.filter((note) => kept.has(note));
  return notes
    .filter((note) => !kept.has(note))
    .map((note) => {
      const after = anchors.findLast((anchor) => anchor.issue <= note.issue);
      const place = after
        ? `after the note for #${String(after.issue)}`
        : 'at the start of the list';
      return {
        line: note.line,
        message: `the note for #${String(note.issue)} is out of issue-number order; it belongs ${place}.`,
      };
    });
}

/**
 * Problems with the notes list of `docs/progress.md`, as `line N: ...`. Each
 * pull request adds its note where its first issue number belongs, never at
 * the top, so pull requests for different issues do not edit the same lines.
 * A note must cite an issue, since that number is its place in the list.
 */
export function progressOrderProblems(markdown: string): string[] {
  const lines = markdown.split('\n');
  const heading = lines.findIndex((line) => line.trim() === '## Notes');
  if (heading < 0) {
    return ['there is no "## Notes" heading.'];
  }
  const problems: Problem[] = [];
  const notes = numbered(withoutDuplicates(notesOf(lines, heading + 1), problems), problems);
  return [...problems, ...outOfOrder(notes)]
    .sort((first, second) => first.line - second.line)
    .map((problem) => `line ${String(problem.line)}: ${problem.message}`);
}
