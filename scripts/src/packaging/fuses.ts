/** The fuse configuration from ADR 0001, as `true` (enabled) or `false` (disabled). */
export const EXPECTED_FUSES: Readonly<Record<string, boolean>> = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false,
};

// Fuse wire bytes as defined by Electron: ASCII '0' is disabled, '1' enabled.
const DISABLED = 48;
const ENABLED = 49;

/**
 * Compares a fuse wire read from a packaged executable with the expected
 * hardening and lists every mismatch, so a packaging change can never
 * silently re-enable a dangerous fuse.
 */
export function fuseMismatches(
  wire: Readonly<Record<string | number, unknown>>,
  // Electron's FuseV1Options enum, including its numeric-to-name reverse entries.
  names: Readonly<Record<string, string | number>>,
): string[] {
  return Object.entries(EXPECTED_FUSES).flatMap(([name, enabled]) => {
    const index = names[name];
    const actual = typeof index === 'number' ? wire[index] : undefined;
    const expected = enabled ? ENABLED : DISABLED;
    return actual === expected
      ? []
      : [`${name}: expected ${enabled ? 'enabled' : 'disabled'}, found ${String(actual)}`];
  });
}
