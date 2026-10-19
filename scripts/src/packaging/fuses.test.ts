import { describe, expect, it } from 'vitest';
import { EXPECTED_FUSES, fuseMismatches } from './fuses.ts';

const names = Object.fromEntries(Object.keys(EXPECTED_FUSES).map((name, index) => [name, index]));
const hardened = Object.fromEntries(
  Object.values(EXPECTED_FUSES).map((enabled, index) => [index, enabled ? 49 : 48]),
);

describe('EXPECTED_FUSES', () => {
  it('matches the hardening table in ADR 0001', () => {
    expect(EXPECTED_FUSES).toEqual({
      RunAsNode: false,
      EnableCookieEncryption: true,
      EnableNodeOptionsEnvironmentVariable: false,
      EnableNodeCliInspectArguments: false,
      EnableEmbeddedAsarIntegrityValidation: true,
      OnlyLoadAppFromAsar: true,
      LoadBrowserProcessSpecificV8Snapshot: false,
      GrantFileProtocolExtraPrivileges: false,
    });
  });
});

describe('fuseMismatches', () => {
  it('accepts a fully hardened wire', () => {
    expect(fuseMismatches({ version: '1', ...hardened }, names)).toEqual([]);
  });

  it('ignores the reverse name entries of a TypeScript enum', () => {
    expect(fuseMismatches(hardened, { ...names, 0: 'RunAsNode' })).toEqual([]);
  });

  it('reports a re-enabled or disabled fuse', () => {
    const wire = { ...hardened, 0: 49, 1: 48 };
    expect(fuseMismatches(wire, names)).toEqual([
      'RunAsNode: expected disabled, found 49',
      'EnableCookieEncryption: expected enabled, found 48',
    ]);
  });

  it('reports fuses missing from the wire or unknown to this Electron', () => {
    const withoutRunAsNode = Object.fromEntries(
      Object.entries(names).filter(([name]) => name !== 'RunAsNode'),
    );
    const wire = { ...hardened };
    delete (wire as Record<string, unknown>)['5'];
    expect(fuseMismatches(wire, withoutRunAsNode)).toEqual([
      'RunAsNode: expected disabled, found undefined',
      'OnlyLoadAppFromAsar: expected enabled, found undefined',
    ]);
  });
});
