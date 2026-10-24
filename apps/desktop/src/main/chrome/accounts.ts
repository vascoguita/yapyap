import { CHROME_CHANNELS, type AccountList, type AccountSummary } from '../../shared/chrome-api.ts';
import { ACCOUNT_COLORS, isAccountColor, MAX_ACCOUNT_NAME } from '../accounts/accounts.ts';
import type { AccountChange } from '../accounts/running.ts';
import { noArguments, type ChromeHandler } from './ipc.ts';

/** The accounts as the Accounts window manages them. */
export interface AccountManager {
  readonly entries: readonly AccountSummary[];
  /** False when YapYap refused the change, such as turning off the last running account. */
  readonly update: (id: string, change: AccountChange) => boolean;
  readonly remove: (id: string) => Promise<boolean>;
  /** Devices the account was allowed until YapYap quits; undefined while it is off. */
  readonly permissions: (id: string) => readonly string[] | undefined;
  /** Makes the account ask again before using the camera or microphone. */
  readonly forgetPermissions: (id: string) => void;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_ACCOUNT_NAME;
}

/** Exactly a name, a known color and two switches: nothing else gets through. */
function parseChange(value: unknown): AccountChange | undefined {
  const { name, color, enabled, muted, ...rest } = Object(value) as Record<string, unknown>;
  const switches = typeof enabled === 'boolean' && typeof muted === 'boolean';
  const complete = isName(name) && isAccountColor(color) && switches;
  return complete && Object.keys(rest).length === 0
    ? { name: name.trim(), color, enabled, muted }
    : undefined;
}

const oneId = ([id, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 && typeof id === 'string';

/** What an account may use, and forgetting the camera and microphone answers (#77). */
function permissionHandlers(current: () => AccountManager | undefined): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.accountsPermissions,
      accepts: oneId,
      handle: (_call, id) => current()?.permissions(id as string) ?? null,
    },
    {
      channel: CHROME_CHANNELS.accountsForgetPermissions,
      accepts: oneId,
      handle: (_call, id) => {
        const manager = current();
        manager?.forgetPermissions(id as string);
        return manager?.permissions(id as string) ?? null;
      },
    },
  ];
}

/**
 * The Accounts window's operations. Every change is checked again here, and
 * removing an account asks the user first, in a dialog the page cannot fake.
 */
export function accountsHandlers(
  /** The accounts once they are open, and their state at each call. */
  current: () => AccountManager | undefined,
  confirmRemove: (name: string) => Promise<boolean>,
): ChromeHandler[] {
  const list = (): AccountList => ({ accounts: current()?.entries ?? [], colors: ACCOUNT_COLORS });
  return [
    { channel: CHROME_CHANNELS.accountsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.accountsSave,
      accepts: ([id, change, ...rest]) =>
        rest.length === 0 && typeof id === 'string' && parseChange(change) !== undefined,
      handle: (_call, id, change) => {
        const manager = current();
        const parsed = parseChange(change);
        const saved = manager !== undefined && parsed !== undefined;
        return saved && manager.update(id as string, parsed) ? list() : null;
      },
    },
    {
      channel: CHROME_CHANNELS.accountsRemove,
      accepts: ([id, ...rest]) => rest.length === 0 && typeof id === 'string',
      handle: async (_call, id) => {
        const manager = current();
        const entry = manager?.entries.find((candidate) => candidate.id === id);
        if (manager !== undefined && entry !== undefined && (await confirmRemove(entry.name))) {
          await manager.remove(entry.id);
        }
        return list();
      },
    },
    ...permissionHandlers(current),
  ];
}
