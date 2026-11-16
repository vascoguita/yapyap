import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { progressNoteProblems } from '../docs/progress-notes.ts';

// Usage: check-progress-notes.ts, from the repository root; `pnpm lint` runs it.
// One file per note, named by its issue, keeps pull requests for different
// issues from editing the same file.
const folder = join('docs', 'progress', 'notes');
const problems = progressNoteProblems(
  readdirSync(folder).map((name) => ({
    name,
    content: readFileSync(join(folder, name), 'utf8'),
  })),
);
console.info(
  problems.map((problem) => `::error::${folder}/${problem}`).join('\n') ||
    'The progress notes are named by their issues.',
);
process.exitCode = Number(problems.length > 0);
