import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { physicalDeclarations } from '../i18n/logical-css.ts';

// Usage: check-logical-css.ts, from the repository root; `pnpm lint` runs it (ADR 0012).
// YapYap's own windows must mirror for right-to-left languages, so their
// styles use logical properties only.
const folder = join('apps', 'desktop', 'src', 'renderer');
const sheets = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((name) =>
  name.endsWith('.css'),
);
const problems = sheets.flatMap((name) =>
  physicalDeclarations(readFileSync(join(folder, name), 'utf8')).map(
    (problem) => `${join(folder, name)} ${problem}: use the logical property instead.`,
  ),
);
console.info(
  problems.map((problem) => `::error::${problem}`).join('\n') || 'The styles are logical.',
);
process.exitCode = Number(problems.length > 0);
