/** What a user let an extension do: its capabilities and the HTTPS hosts it may reach. */
export interface Grants {
  readonly capabilities: readonly string[];
  readonly hosts: readonly string[];
}

export type ApprovalChange =
  | { readonly kind: 'none' }
  /** Only what is new: the consent screen asks about these and nothing else. */
  | { readonly kind: 'reapprove'; readonly added: Grants };

function added(granted: readonly string[], requested: readonly string[]): string[] {
  const known = new Set(granted);
  return requested.filter((grant) => !known.has(grant));
}

/**
 * Compares an update's requests with what the user already granted (ADR 0004).
 * Dropping a grant takes nothing from the user, so only additions need a new
 * approval.
 */
export function diffGrants(granted: Grants, requested: Grants): ApprovalChange {
  const change = {
    capabilities: added(granted.capabilities, requested.capabilities),
    hosts: added(granted.hosts, requested.hosts),
  };
  return change.capabilities.length + change.hosts.length === 0
    ? { kind: 'none' }
    : { kind: 'reapprove', added: change };
}
