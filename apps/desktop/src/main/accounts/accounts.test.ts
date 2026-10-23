import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_COLORS,
  accountIdsInPartitions,
  colorFor,
  parseAccounts,
  partitionOf,
  serializeAccounts,
  type Accounts,
} from './accounts.ts';

const A = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const B = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';
const C = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

const valid: Accounts = {
  version: 1,
  accounts: [
    { id: A, name: 'Personal', color: 'green', enabled: true },
    { id: B, name: 'Work', color: 'blue', enabled: false },
  ],
  active: B,
};

const fresh = () => C;

describe('partitionOf', () => {
  it('gives each account its own persistent partition', () => {
    expect(partitionOf({ id: A })).toBe(`persist:account-${A}`);
  });
});

describe('accountIdsInPartitions', () => {
  it('finds account sessions among Electron’s partition folders, in order', () => {
    expect(
      accountIdsInPartitions([`account-${B}`, 'yapyap-chrome', `account-${A}`, `account-${A}x`]),
    ).toEqual([A, B]);
  });
});

describe('colorFor', () => {
  it('goes round the colors, starting with the first', () => {
    expect([1, 2, 6, 7].map(colorFor)).toEqual(['green', 'blue', 'teal', 'green']);
  });

  it('falls back to the first color before the first position', () => {
    expect(colorFor(0)).toBe('green');
  });
});

describe('parseAccounts', () => {
  it('reads a valid file', () => {
    expect(parseAccounts(JSON.stringify(valid), [], fresh)).toEqual(valid);
  });

  it('accepts every color the chrome offers', () => {
    for (const color of ACCOUNT_COLORS) {
      const file = { ...valid, accounts: [{ ...valid.accounts[0], color }], active: A };
      expect(parseAccounts(JSON.stringify(file), [], fresh)).toEqual(file);
    }
  });

  it('creates one account when there is no file and no session', () => {
    expect(parseAccounts(undefined, [], fresh)).toEqual({
      version: 1,
      accounts: [{ id: C, name: 'WhatsApp', color: 'green', enabled: true }],
      active: C,
    });
  });

  it('rebuilds damaged files from the sessions on disk, so nobody is logged out', () => {
    for (const text of ['{', '{"version":2}', JSON.stringify({ ...valid, active: C })]) {
      expect(parseAccounts(text, [A, B], fresh)).toEqual({
        version: 1,
        accounts: [
          { id: A, name: 'WhatsApp', color: 'green', enabled: true },
          { id: B, name: 'WhatsApp 2', color: 'blue', enabled: true },
        ],
        active: A,
      });
    }
  });

  it('refuses the same account twice', () => {
    const twice = { ...valid, accounts: [valid.accounts[0], valid.accounts[0]], active: A };
    expect(parseAccounts(JSON.stringify(twice), [], fresh).accounts).toHaveLength(1);
  });
});

describe('serializeAccounts', () => {
  it('writes indented JSON that reads back the same', () => {
    const text = serializeAccounts(valid);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseAccounts(text, [], fresh)).toEqual(valid);
  });
});
