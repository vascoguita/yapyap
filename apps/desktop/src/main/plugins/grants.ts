import type { PluginGrant } from '../../shared/chrome-api.ts';
import type { PluginRecord } from './records.ts';

/**
 * Capabilities that act on the account on screen, so the user can grant
 * them for some accounts and not others; the rest belong to the plugin.
 */
const ACCOUNT_CAPABILITIES: ReadonlySet<string> = new Set([
  'chat:read-active',
  'chat:read-unread-summary',
  'composer:insert-draft',
]);

const NETWORK = 'network:';

type Grants = Pick<PluginRecord, 'capabilities' | 'hosts' | 'revoked' | 'revokedIn'>;

/** Whether the user approved `capability` at install, `network:<host>` included. */
function approved(record: Grants, capability: string): boolean {
  return capability.startsWith(NETWORK)
    ? record.hosts.includes(capability.slice(NETWORK.length))
    : (record.capabilities as readonly string[]).includes(capability);
}

/**
 * Whether the plugin may use `capability` now (ADR 0004, #94): approved at
 * install, not revoked since, and, for a capability that acts on an
 * account, granted for `account`, the one on screen.
 */
export function holds(record: Grants, capability: string, account: string | undefined): boolean {
  if (!approved(record, capability) || (record.revoked ?? []).includes(capability)) {
    return false;
  }
  if (!ACCOUNT_CAPABILITIES.has(capability)) {
    return true;
  }
  return account !== undefined && !(record.revokedIn?.[account] ?? []).includes(capability);
}

/** The hosts the plugin may reach now: approved, and not revoked since. */
export function grantedHosts(record: Grants): string[] {
  return record.hosts.filter((host) => !(record.revoked ?? []).includes(`${NETWORK}${host}`));
}

const toggled = (list: readonly string[], item: string, present: boolean): string[] =>
  present ? [...new Set([...list, item])] : list.filter((entry) => entry !== item);

/**
 * The record with `capability` granted again or revoked: for one account
 * when it acts on accounts and `account` is given, for the whole plugin
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
  const revokedIn = { ...record.revokedIn };
  revokedIn[account] = toggled(revokedIn[account] ?? [], capability, !granted);
  return { ...record, revokedIn };
}

/** What the Plugins window shows of a plugin's grants. */
export function grantsOf(
  record: Grants,
  accounts: readonly { readonly id: string; readonly name: string }[],
): PluginGrant[] {
  const capabilities = [...record.capabilities, ...record.hosts.map((host) => `${NETWORK}${host}`)];
  return capabilities.map((capability) => {
    const granted = !(record.revoked ?? []).includes(capability);
    if (!ACCOUNT_CAPABILITIES.has(capability)) {
      return { capability, granted };
    }
    return {
      capability,
      granted,
      accounts: accounts.map(({ id, name }) => ({
        id,
        name,
        granted: !(record.revokedIn?.[id] ?? []).includes(capability),
      })),
    };
  });
}
