/**
 * Licenses compatible with distributing YapYap under MIT. Copyleft licenses
 * that would bind the whole app (GPL, AGPL, LGPL for bundled code, SSPL) are
 * deliberately absent; MPL-2.0 is file-scoped and therefore compatible.
 */
export const ALLOWED_LICENSES: ReadonlySet<string | undefined> = new Set([
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

const OPERATORS: ReadonlySet<string | undefined> = new Set(['AND', 'OR', 'WITH', '(', ')']);

class Parser {
  private readonly tokens: readonly string[];
  private position = 0;

  constructor(tokens: readonly string[]) {
    this.tokens = tokens;
  }

  /** expression := term ("OR" term)* — AND binds tighter than OR in SPDX. */
  expression(): boolean {
    let allowed = this.term();
    while (this.accept('OR')) {
      const right = this.term();
      allowed ||= right;
    }
    return allowed;
  }

  get finished(): boolean {
    return this.position === this.tokens.length;
  }

  private term(): boolean {
    let allowed = this.factor();
    while (this.accept('AND')) {
      const right = this.factor();
      allowed &&= right;
    }
    return allowed;
  }

  private factor(): boolean {
    if (this.accept('(')) {
      const allowed = this.expression();
      this.expect(')');
      return allowed;
    }
    const license = this.identifier();
    // An exception can only widen what the base license permits, so judge the base.
    if (this.accept('WITH')) this.identifier();
    return ALLOWED_LICENSES.has(license);
  }

  // Reading past the end yields undefined, which no allowlist contains and which
  // leaves the parser unfinished, so it needs no separate check.
  private identifier(): string | undefined {
    const token = this.tokens[this.position++];
    if (OPERATORS.has(token)) throw new SyntaxError();
    return token;
  }

  private accept(token: string): boolean {
    if (this.tokens[this.position] !== token) return false;
    this.position++;
    return true;
  }

  private expect(token: string): void {
    if (!this.accept(token)) throw new SyntaxError();
  }
}

/** Evaluates an SPDX license expression; malformed expressions are never allowed. */
export function isAllowed(expression: string): boolean {
  const tokens = expression
    .replace(/[()]/g, ' $& ')
    .split(/\s/)
    .filter((token) => token !== '');
  const parser = new Parser(tokens);
  try {
    return parser.expression() && parser.finished;
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> {
  // Object() maps null and undefined to {} and leaves objects untouched.
  return Object(value) as Record<string, unknown>;
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
