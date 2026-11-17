/** One file of `docs/progress/notes/`. */
export interface NoteFile {
  readonly name: string;
  readonly content: string;
}

/** `123.md`: the issue the pull request closes. */
const NAME = /^([1-9]\d*)\.md$/;

/** The first `#123` a note cites; `page#12` and `#12a` are not issue numbers. */
const ISSUE = /\B#(\d+)\b/;

function problemsOf({ name, content }: NoteFile): string[] {
  const named = NAME.exec(name)?.[1];
  if (named === undefined) {
    return ['name the note after the issue its pull request closes, as in "123.md".'];
  }
  const cited = ISSUE.exec(content)?.[1];
  if (cited === undefined) {
    return [`the note cites no issue; start it with "Topic (#${named}): ...".`];
  }
  return cited === named
    ? []
    : [
        `the note cites #${cited} first but is named ${name}; name it ${cited}.md or cite #${named} first.`,
      ];
}

/**
 * Problems with the progress notes, as `<file>: ...`. Each pull request adds
 * its note as a file named by the issue it closes, which the note cites
 * first, so pull requests for different issues never edit the same file
 * (#660) and the progress page can list the notes in issue-number order.
 */
export function progressNoteProblems(files: readonly NoteFile[]): string[] {
  return files.flatMap((file) => problemsOf(file).map((problem) => `${file.name}: ${problem}`));
}
