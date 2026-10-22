import { describe, expect, it } from 'vitest';
import {
  decideUpdatePolicy,
  describeUpdatePolicy,
  isDeveloperIdSigned,
  type InstallEvidence,
  type UpdatePolicy,
} from './update-policy.ts';

const plain = { env: {}, flatpakInfo: false, developerIdSigned: false };
const EVIDENCE: Readonly<Record<string, InstallEvidence>> = {
  linux: { ...plain, platform: 'linux' },
  'linux AppImage': { ...plain, platform: 'linux', env: { APPIMAGE: '/home/u/YapYap.AppImage' } },
  'linux Flatpak info': { ...plain, platform: 'linux', flatpakInfo: true },
  'linux FLATPAK_ID': {
    ...plain,
    platform: 'linux',
    env: { FLATPAK_ID: 'org.guita.YapYap', APPIMAGE: '/x' },
  },
  Windows: { ...plain, platform: 'win32' },
  'Windows portable': { ...plain, platform: 'win32', env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Apps' } },
  'macOS ad hoc': { ...plain, platform: 'darwin' },
  'macOS Developer ID': { ...plain, platform: 'darwin', developerIdSigned: true },
};

/** Every channel against every kind of evidence; rows follow the keys of EVIDENCE. */
const EXPECTED: Readonly<Record<string, readonly UpdatePolicy[]>> = {
  //            linux     AppImage       Flatpak   FLATPAK_ID  Windows        portable  macOS adhoc  macOS DevID
  appimage: ['manual', 'self-update', 'manual', 'manual', 'manual', 'manual', 'manual', 'manual'],
  nsis: ['manual', 'manual', 'manual', 'manual', 'self-update', 'manual', 'manual', 'manual'],
  portable: ['manual', 'manual', 'manual', 'manual', 'manual', 'notify', 'manual', 'manual'],
  dmg: ['manual', 'manual', 'manual', 'manual', 'manual', 'manual', 'notify', 'self-update'],
  deb: ['system', 'system', 'system', 'system', 'system', 'system', 'system', 'system'],
  rpm: ['system', 'system', 'system', 'system', 'system', 'system', 'system', 'system'],
  aur: ['system', 'system', 'system', 'system', 'system', 'system', 'system', 'system'],
  flatpak: ['system', 'system', 'system', 'system', 'system', 'system', 'system', 'system'],
  development: ['manual', 'manual', 'manual', 'manual', 'manual', 'manual', 'manual', 'manual'],
  zip: ['manual', 'manual', 'manual', 'manual', 'manual', 'manual', 'manual', 'manual'],
};

describe('decideUpdatePolicy', () => {
  const cases = Object.entries(EXPECTED).flatMap(([channel, policies]) =>
    Object.entries(EVIDENCE).map(([name, evidence], index) => ({
      channel,
      name,
      evidence,
      policy: policies[index],
    })),
  );

  it.each(cases)('$channel with $name evidence: $policy', ({ channel, evidence, policy }) => {
    expect(decideUpdatePolicy(channel, evidence)).toEqual({ channel, policy });
  });

  it('covers every channel the packaging stamps', () => {
    expect(Object.keys(EXPECTED)).toEqual(
      expect.arrayContaining([
        'appimage',
        'nsis',
        'portable',
        'dmg',
        'deb',
        'rpm',
        'aur',
        'flatpak',
      ]),
    );
  });

  it('trusts a variable only on the system that sets it', () => {
    expect(
      decideUpdatePolicy('appimage', { ...plain, platform: 'win32', env: { APPIMAGE: 'C:\\a' } })
        .policy,
    ).toBe('manual');
    expect(
      decideUpdatePolicy('portable', {
        ...plain,
        platform: 'linux',
        env: { PORTABLE_EXECUTABLE_DIR: '/opt' },
      }).policy,
    ).toBe('manual');
  });

  it('treats an empty variable as absent', () => {
    expect(
      decideUpdatePolicy('appimage', { ...plain, platform: 'linux', env: { APPIMAGE: '' } }).policy,
    ).toBe('manual');
    expect(
      decideUpdatePolicy('nsis', {
        ...plain,
        platform: 'win32',
        env: { PORTABLE_EXECUTABLE_DIR: '', FLATPAK_ID: '' },
      }).policy,
    ).toBe('self-update');
  });
});

describe('isDeveloperIdSigned', () => {
  it('accepts a Developer ID signature', () => {
    expect(
      isDeveloperIdSigned(
        'Executable=/Applications/YapYap.app/Contents/MacOS/YapYap\nAuthority=Developer ID Application: Example (TEAM123456)\nAuthority=Apple Root CA',
      ),
    ).toBe(true);
  });

  it.each([
    'Signature=adhoc',
    'Authority=Apple Development: someone@example.com (ABC)',
    'code object is not signed at all',
    'xAuthority=Developer ID Application: Example',
  ])('rejects %j', (output) => {
    expect(isDeveloperIdSigned(output)).toBe(false);
  });
});

describe('describeUpdatePolicy', () => {
  it('names the policy and the channel', () => {
    expect(describeUpdatePolicy({ channel: 'deb', policy: 'system' })).toBe('Updates system (deb)');
  });
});
