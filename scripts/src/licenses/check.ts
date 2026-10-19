/**
 * Licenses compatible with distributing YapYap under MIT. Copyleft licenses
 * that would bind the whole app (GPL, AGPL, LGPL for bundled code, SSPL) are
 * deliberately absent; MPL-2.0 is file-scoped and therefore compatible.
 */
const ALLOWED_LICENSES: ReadonlySet<string> = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

export interface Violation {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
}

/** Evaluates simple SPDX expressions: `A OR B` needs one allowed side, `A AND B` needs all. */
export function isAllowed(expression: string): boolean {
  const flat = expression.replace(/[()]/g, ' ').trim();
  return flat
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative.split(/\s+AND\s+/).every((license) => ALLOWED_LICENSES.has(license.trim())),
    );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function toViolation(entry: unknown, license: string): Violation {
  const { name, versions } = record(entry);
  return {
    name: typeof name === 'string' ? name : '(unknown package)',
    versions: Array.isArray(versions)
      ? versions.filter((v): v is string => typeof v === 'string')
      : [],
    license,
  };
}

/** Reads the JSON printed by `pnpm licenses list --json`. */
export function findViolations(report: unknown): Violation[] {
  return Object.entries(record(report)).flatMap(([license, packages]) =>
    isAllowed(license) || !Array.isArray(packages)
      ? []
      : packages.map((entry) => toViolation(entry, license)),
  );
}

export function formatReport(violations: readonly Violation[]): string {
  if (violations.length === 0) return 'All dependency licenses are compatible with MIT.';
  const lines = violations.map(
    ({ name, versions, license }) => `  ${name}@${versions.join(',')}: ${license}`,
  );
  return ['Dependencies with licenses incompatible with MIT distribution:', ...lines].join('\n');
}
