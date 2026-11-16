import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { progressOrderProblems } from '../docs/progress-order.ts';

// Usage: check-progress-order.ts, from the repository root; `pnpm lint` runs it.
// Notes in issue-number order keep pull requests for different issues from
// editing the same lines of the progress page.
const file = join('docs', 'progress.md');
const problems = progressOrderProblems(readFileSync(file, 'utf8'));
console.info(
  problems.map((problem) => `::error::${file} ${problem}`).join('\n') ||
    'The progress notes are in issue-number order.',
);
process.exitCode = Number(problems.length > 0);
