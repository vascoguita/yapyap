import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { checkCatalogFiles } from '../i18n/check.ts';
import { catalogType, GENERATED, SOURCE } from '../i18n/types.ts';

// Usage: check-catalogs.ts, from the repository root; `pnpm lint` runs it (ADR 0012).
const folder = join(SOURCE, '..');
const names = readdirSync(folder).filter((name) => name.endsWith('.json'));
const catalogs = new Map(names.map((name) => [name, readFileSync(join(folder, name), 'utf8')]));
const options = await resolveConfig(GENERATED);
const english = JSON.parse(catalogs.get('en.json') ?? '{}') as never;
const expectedType = await format(catalogType(english), { ...options, filepath: GENERATED });
const committedType = readFileSync(GENERATED, 'utf8');
const problems = checkCatalogFiles({ catalogs, committedType, expectedType });
console.info(problems.map((problem) => `::error::${problem}`).join('\n') || 'The catalogs pass.');
process.exitCode = Number(problems.length > 0);
