import {
  entries,
  placeholders,
  type CatalogJson,
  type Entry,
} from '../../../apps/desktop/src/shared/messages/catalog.ts';

/** Where the generated type lives, and the catalog it comes from. */
export const SOURCE = 'apps/desktop/src/shared/messages/locales/en.json';
export const GENERATED = 'apps/desktop/src/shared/messages/messages.generated.ts';

const HEADER = [
  `// Generated from ${SOURCE.slice(SOURCE.indexOf('locales/'))} by scripts/src/bin/i18n-types.ts;`,
  '// change the catalog and run it again rather than editing this file.',
  '',
  '/** The shape every message catalog has, from the English source (ADR 0012). */',
].join('\n');

/** The parameters of a message: `count` picks a plural form, so it is a number. */
function params(names: readonly string[]): string {
  const fields = names.map((name) =>
    name === 'count' ? 'readonly count: number;' : `readonly ${name}: string | number;`,
  );
  return `(params: { ${fields.join(' ')} }) => string`;
}

function typeOf(entry: Entry): string {
  if (entry.kind === 'text') {
    const names = placeholders(entry.text);
    return names.length === 0 ? 'string' : params(names);
  }
  if (entry.kind === 'plural') {
    const names = Object.values(entry.forms).flatMap((text) => placeholders(text));
    return params([...new Set([...names, 'count'])].sort((a, b) => a.localeCompare(b)));
  }
  return group(entry.group);
}

/** A key as a property name: quoted unless it is an identifier, such as `chat:read-active`. */
const property = (key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);

function group(level: CatalogJson): string {
  const fields = [...entries(level)].map(
    ([key, entry]) => `readonly ${property(key)}: ${typeOf(entry)};`,
  );
  return `{ ${fields.join(' ')} }`;
}

/**
 * The TypeScript type of the English catalog, before formatting: strings stay
 * strings, and messages with placeholders or plural forms become functions
 * of named values, as `buildCatalog` makes them.
 */
export function catalogType(english: CatalogJson): string {
  return `${HEADER}\nexport interface Messages ${group(english)}\n`;
}
