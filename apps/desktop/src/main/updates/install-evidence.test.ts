import { describe, expect, it, vi } from 'vitest';
import { readInstallEvidence } from './install-evidence.ts';

const SIGNED = 'Authority=Developer ID Application: Example (TEAM123456)';

describe('readInstallEvidence', () => {
  it('looks for the Flatpak marker file and skips codesign off macOS', () => {
    const exists = vi.fn((path: string) => path === '/.flatpak-info');
    const codesign = vi.fn(() => SIGNED);
    expect(
      readInstallEvidence({ platform: 'linux', env: { APPIMAGE: '/a' }, exists, codesign }),
    ).toEqual({
      platform: 'linux',
      env: { APPIMAGE: '/a' },
      flatpakInfo: true,
      developerIdSigned: false,
    });
    expect(codesign).not.toHaveBeenCalled();
  });

  it('reads the Developer ID signature on macOS', () => {
    const evidence = readInstallEvidence({
      platform: 'darwin',
      env: {},
      exists: () => false,
      codesign: () => SIGNED,
    });
    expect(evidence).toEqual(
      expect.objectContaining({ flatpakInfo: false, developerIdSigned: true }),
    );
  });

  it('treats a failing codesign as unsigned', () => {
    const evidence = readInstallEvidence({
      platform: 'darwin',
      env: {},
      exists: () => false,
      codesign: () => {
        throw new Error('codesign: not found');
      },
    });
    expect(evidence.developerIdSigned).toBe(false);
  });
});
