/** The snippets that apply to every account; each account's own follow them. */
export const ALL_ACCOUNTS = 'all';

/** Room for a long stylesheet or script, while the file stays small enough to read at start. */
export const MAX_SNIPPET = 64 * 1024;

export interface Snippet {
  readonly css: string;
  readonly js: string;
}

/** The user's own CSS and JavaScript (#72), off until they turn it on. */
export interface CustomCode {
  readonly enabled: boolean;
  /** By scope: `ALL_ACCOUNTS`, or an account's ID. */
  readonly snippets: Readonly<Record<string, Snippet>>;
}

export const NO_CUSTOM_CODE: CustomCode = { enabled: false, snippets: {} };

export const isSnippetText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_SNIPPET;
