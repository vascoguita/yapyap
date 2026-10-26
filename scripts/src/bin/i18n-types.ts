import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { catalogType, GENERATED, SOURCE } from '../i18n/types.ts';

// Usage: i18n-types.ts, from the repository root, after changing en.json.
const source = catalogType(JSON.parse(readFileSync(SOURCE, 'utf8')) as never);
const options = await resolveConfig(GENERATED);
writeFileSync(GENERATED, await format(source, { ...options, filepath: GENERATED }));
console.info(`Wrote ${GENERATED}.`);
