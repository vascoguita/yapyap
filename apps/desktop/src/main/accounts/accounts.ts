import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { en } from '../../shared/messages/en.ts';

/** Colors an account can take; the chrome maps each to a shade that suits the theme. */
export const ACCOUNT_COLORS = ['green', 'blue', 'purple', 'orange', 'red', 'teal'] as const;

/** The longest account name, which still fits the menu and the sidebar. */
export const MAX_ACCOUNT_NAME = 40;

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const PARTITION_PREFIX = 'account-';
const FORMAT_VERSION = 1;

const AccountSchema = Type.Object(
  {
    id: Type.String({ pattern: UUID }),
    name: Type.String({ minLength: 1, maxLength: MAX_ACCOUNT_NAME }),
    color: Type.Union([
      Type.Literal('green'),
      Type.Literal('blue'),
      Type.Literal('purple'),
      Type.Literal('orange'),
      Type.Literal('red'),
      Type.Literal('teal'),
    ]),
    enabled: Type.Boolean(),
    // Optional, so files written before muting existed stay valid (#61).
    muted: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const AccountsSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    accounts: Type.Array(AccountSchema, { minItems: 1, maxItems: 32 }),
    active: Type.String({ pattern: UUID }),
  },
  { additionalProperties: false },
);

export type Account = Static<typeof AccountSchema>;

export function isAccountColor(value: unknown): value is Account['color'] {
  return (ACCOUNT_COLORS as readonly unknown[]).includes(value);
}
export type Accounts = Static<typeof AccountsSchema>;

/**
 * Each account's own persistent session (ADR 0001): cookies, storage,
 * service workers and cache never cross accounts.
 */
export function partitionOf(account: Pick<Account, 'id'>): string {
  return `persist:${PARTITION_PREFIX}${account.id}`;
}

/** The account IDs whose session folders Electron keeps under `Partitions/`. */
export function accountIdsInPartitions(folderNames: readonly string[]): string[] {
  const id = new RegExp(UUID.replace('^', `^${PARTITION_PREFIX}`));
  return folderNames
    .filter((name) => id.test(name))
    .map((name) => name.slice(PARTITION_PREFIX.length))
    .sort((a, b) => a.localeCompare(b));
}

/** Colors go round in order, so neighbouring accounts look different; position 1 is the first. */
export function colorFor(position: number): Account['color'] {
  return ACCOUNT_COLORS[(position - 1) % ACCOUNT_COLORS.length] ?? ACCOUNT_COLORS[0];
}

function newAccount(id: string, position: number): Account {
  return { id, name: en.accounts.defaultName(position), color: colorFor(position), enabled: true };
}

/** Every ID appears once, and the active account is one of them. */
function isConsistent(value: Accounts): boolean {
  const ids = value.accounts.map((account) => account.id);
  return new Set(ids).size === ids.length && ids.includes(value.active);
}

/**
 * Reads `accounts.json`. When it is missing or damaged, the accounts are
 * rebuilt from the session folders on disk, so nobody is logged out by a
 * bad file; with none, there is one new account.
 */
export function parseAccounts(
  text: string | undefined,
  partitionIds: readonly string[],
  newId: () => string,
): Accounts {
  try {
    const value: unknown = JSON.parse(text ?? '');
    if (Value.Check(AccountsSchema, value) && isConsistent(value)) {
      return value;
    }
  } catch {
    // Rebuilt below.
  }
  const [first = newId(), ...others] = partitionIds;
  const accounts = [first, ...others].map((id, index) => newAccount(id, index + 1));
  return { accounts, version: FORMAT_VERSION, active: first };
}

/** The file's text, stable so it changes only when the accounts do. */
export function serializeAccounts(accounts: Accounts): string {
  return `${JSON.stringify(accounts, null, 2)}\n`;
}
