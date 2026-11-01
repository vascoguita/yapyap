import type { ExtensionGrant } from '../../shared/chrome-api.ts';
import type { ExtensionRecord } from './records.ts';

/**
 * Capabilities that act on the account on screen, so the user can grant
 * them for some accounts and not others; the rest belong to the extension.
 */
const ACCOUNT_CAPABILITIES: ReadonlySet<string> = new Set([
  'chat:read-active',
  'chat:read-unread-summary',
  'composer:insert-draft',
  'composer:read-draft',
  'calls:record',
]);

const NETWORK = 'network:';

type Grants = Pick<ExtensionRecord, 'capabilities' | 'hosts' | 'revoked' | 'revokedIn'>;

/** What the user took back from the whole extension. */
const revokedFrom = (record: Grants): ReadonlySet<string> => new Set(record.revoked);

/** What the user took back for one account. */
const revokedIn = (record: Grants, account: string): ReadonlySet<string> =>
  new Set(record.revokedIn?.[account]);

/** Whether the user approved `capability` at install, `network:<host>` included. */
function approved(record: Grants, capability: string): boolean {
  return capability.startsWith(NETWORK)
    ? record.hosts.includes(capability.slice(NETWORK.length))
    : (record.capabilities as readonly string[]).includes(capability);
}

/**
 * Whether the extension may use `capability` now (ADR 0004, #94): approved at
 * install, not revoked since, and, for a capability that acts on an
 * account, granted for `account`, the one on screen.
 */
export function holds(record: Grants, capability: string, account: string | undefined): boolean {
  if (!approved(record, capability) || revokedFrom(record).has(capability)) {
    return false;
  }
  if (!ACCOUNT_CAPABILITIES.has(capability)) {
    return true;
  }
  return account !== undefined && !revokedIn(record, account).has(capability);
}

/** The hosts the extension may reach now: approved, and not revoked since. */
export function grantedHosts(record: Grants): string[] {
  const revoked = revokedFrom(record);
  return record.hosts.filter((host) => !revoked.has(`${NETWORK}${host}`));
}

const toggled = (list: readonly string[], item: string, present: boolean): string[] =>
  present ? [...new Set([...list, item])] : list.filter((entry) => entry !== item);

/**
 * The record with `capability` granted again or revoked: for one account
 * when it acts on accounts and `account` is given, for the whole extension
 * otherwise. Nothing the user did not approve at install can be granted.
 */
export function withGrant<Record extends Grants>(
  record: Record,
  capability: string,
  account: string | undefined,
  granted: boolean,
): Record {
  if (!approved(record, capability)) {
    return record;
  }
  if (account === undefined || !ACCOUNT_CAPABILITIES.has(capability)) {
    return { ...record, revoked: toggled(record.revoked ?? [], capability, !granted) };
  }
  const byAccount = { ...record.revokedIn };
  byAccount[account] = toggled(byAccount[account] ?? [], capability, !granted);
  return { ...record, revokedIn: byAccount };
}

/** What the Extensions window shows of an extension's grants. */
export function grantsOf(
  record: Grants,
  accounts: readonly { readonly id: string; readonly name: string }[],
): ExtensionGrant[] {
  const capabilities = [...record.capabilities, ...record.hosts.map((host) => `${NETWORK}${host}`)];
  return capabilities.map((capability) => {
    const granted = !revokedFrom(record).has(capability);
    if (!ACCOUNT_CAPABILITIES.has(capability)) {
      return { capability, granted };
    }
    return {
      capability,
      granted,
      accounts: accounts.map(({ id, name }) => ({
        id,
        name,
        granted: !revokedIn(record, id).has(capability),
      })),
    };
  });
}
