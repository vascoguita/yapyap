import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffGrants } from './approvals.ts';

const GRANTED = {
  capabilities: ['composer:insert-draft', 'storage:local'],
  hosts: ['api.example.org'],
};

describe('diffGrants', () => {
  it('needs nothing when an update asks for the same grants', () => {
    expect(diffGrants(GRANTED, GRANTED)).toEqual({ kind: 'none' });
  });

  it('needs nothing when an update drops a capability or a host', () => {
    expect(diffGrants(GRANTED, { capabilities: ['storage:local'], hosts: [] })).toEqual({
      kind: 'none',
    });
  });

  it('asks again for exactly the hosts an update adds', () => {
    const requested = { ...GRANTED, hosts: ['api.example.org', 'cdn.example.org'] };
    expect(diffGrants(GRANTED, requested)).toEqual({
      kind: 'reapprove',
      added: { capabilities: [], hosts: ['cdn.example.org'] },
    });
  });

  it('asks again for exactly the capabilities an update adds, even if it drops others', () => {
    const requested = { capabilities: ['secrets:own'], hosts: ['api.example.org'] };
    expect(diffGrants(GRANTED, requested)).toEqual({
      kind: 'reapprove',
      added: { capabilities: ['secrets:own'], hosts: [] },
    });
  });

  it('never asks about a grant the user already gave, and always asks about a new one', () => {
    const grants = fc.record({
      capabilities: fc.uniqueArray(fc.string()),
      hosts: fc.uniqueArray(fc.string()),
    });
    fc.assert(
      fc.property(grants, grants, (granted, requested) => {
        const change = diffGrants(granted, requested);
        const added = change.kind === 'none' ? { capabilities: [], hosts: [] } : change.added;
        expect(added.capabilities).toEqual(
          requested.capabilities.filter((grant) => !granted.capabilities.includes(grant)),
        );
        expect(added.hosts).toEqual(
          requested.hosts.filter((grant) => !granted.hosts.includes(grant)),
        );
      }),
    );
  });
});
