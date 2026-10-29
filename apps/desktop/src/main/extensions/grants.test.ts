import { describe, expect, it } from 'vitest';
import { grantedHosts, grantsOf, holds, withGrant } from './grants.ts';
import type { ExtensionRecord } from './records.ts';

const WORK = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';
const HOME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const RECORD: ExtensionRecord = {
  id: 'org.example.hello',
  version: '1.0.0',
  fingerprint: null,
  firstParty: false,
  developer: true,
  capabilities: ['composer:insert-draft', 'notifications:show'],
  hosts: ['api.example.org', 'llm.example.net'],
};

describe('holds', () => {
  it('grants what the user approved, and nothing else', () => {
    expect(holds(RECORD, 'notifications:show', undefined)).toBe(true);
    expect(holds(RECORD, 'network:api.example.org', undefined)).toBe(true);
    expect(holds(RECORD, 'secrets:own', WORK)).toBe(false);
    expect(holds(RECORD, 'network:other.example.org', WORK)).toBe(false);
  });

  it('grants a capability that acts on an account only for an account on screen', () => {
    const all = {
      ...RECORD,
      capabilities: [
        'chat:read-active',
        'chat:read-unread-summary',
        'composer:insert-draft',
        'composer:read-draft',
        'assistant:bar',
        'calls:record',
      ] as ExtensionRecord['capabilities'],
    };
    for (const capability of all.capabilities) {
      expect(holds(all, capability, WORK)).toBe(true);
      expect(holds(all, capability, undefined)).toBe(false);
    }
  });

  it('honours what the user took back, for the extension or for one account', () => {
    const fromAll = withGrant(RECORD, 'notifications:show', undefined, false);
    expect(holds(fromAll, 'notifications:show', WORK)).toBe(false);
    const fromWork = withGrant(RECORD, 'composer:insert-draft', WORK, false);
    expect(holds(fromWork, 'composer:insert-draft', WORK)).toBe(false);
    expect(holds(fromWork, 'composer:insert-draft', HOME)).toBe(true);
    const everywhere = withGrant(RECORD, 'composer:insert-draft', undefined, false);
    expect(holds(everywhere, 'composer:insert-draft', HOME)).toBe(false);
  });
});

describe('withGrant', () => {
  it('takes a grant back and gives it again, once each, keeping other accounts apart', () => {
    const off = withGrant(
      withGrant(RECORD, 'notifications:show', undefined, false),
      'notifications:show',
      undefined,
      false,
    );
    expect(off.revoked).toEqual(['notifications:show']);
    expect(withGrant(off, 'notifications:show', undefined, true).revoked).toEqual([]);
    const two = withGrant(off, 'network:api.example.org', undefined, false);
    expect(withGrant(two, 'notifications:show', undefined, true).revoked).toEqual([
      'network:api.example.org',
    ]);
    const work = withGrant(RECORD, 'composer:insert-draft', WORK, false);
    const both = withGrant(work, 'composer:insert-draft', HOME, false);
    expect(both.revokedIn).toEqual({
      [WORK]: ['composer:insert-draft'],
      [HOME]: ['composer:insert-draft'],
    });
    expect(withGrant(both, 'composer:insert-draft', WORK, true).revokedIn).toEqual({
      [WORK]: [],
      [HOME]: ['composer:insert-draft'],
    });
  });

  it('takes an extension-wide capability back for the extension even when given an account', () => {
    expect(withGrant(RECORD, 'notifications:show', WORK, false).revoked).toEqual([
      'notifications:show',
    ]);
  });

  it('never grants what the user did not approve at install', () => {
    expect(withGrant(RECORD, 'secrets:own', undefined, true)).toBe(RECORD);
    expect(withGrant(RECORD, 'network:evil.example.com', undefined, true)).toBe(RECORD);
  });
});

describe('grantedHosts', () => {
  it('leaves out hosts the user took back', () => {
    expect(grantedHosts(RECORD)).toEqual(['api.example.org', 'llm.example.net']);
    const revoked = withGrant(RECORD, 'network:llm.example.net', undefined, false);
    expect(grantedHosts(revoked)).toEqual(['api.example.org']);
  });
});

describe('grantsOf', () => {
  it('lists every approved grant, and account by account for those that act on accounts', () => {
    const record = withGrant(
      withGrant(RECORD, 'composer:insert-draft', WORK, false),
      'network:llm.example.net',
      undefined,
      false,
    );
    expect(
      grantsOf(record, [
        { id: WORK, name: 'Work' },
        { id: HOME, name: 'Home' },
      ]),
    ).toEqual([
      {
        capability: 'composer:insert-draft',
        granted: true,
        accounts: [
          { id: WORK, name: 'Work', granted: false },
          { id: HOME, name: 'Home', granted: true },
        ],
      },
      { capability: 'notifications:show', granted: true },
      { capability: 'network:api.example.org', granted: true },
      { capability: 'network:llm.example.net', granted: false },
    ]);
    expect(grantsOf(RECORD, []).every((grant) => grant.granted)).toBe(true);
    expect(grantsOf(RECORD, [{ id: WORK, name: 'Work' }])[0]).toEqual({
      capability: 'composer:insert-draft',
      granted: true,
      accounts: [{ id: WORK, name: 'Work', granted: true }],
    });
  });
});
