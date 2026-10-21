export const TROUBLESHOOTING_URL =
  'https://vascoguita.github.io/yapyap/guide/troubleshooting#sandbox';

/** Also written to stderr, so it reaches people who start YapYap from a terminal. */
export const UNSAFE_START_MESSAGE =
  'YapYap cannot start safely: its sandbox is turned off. On Ubuntu 24.04 and later this happens with the AppImage, because the system restricts unprivileged user namespaces. Install the .deb, .rpm or Flatpak package instead, or allow the AppImage with an AppArmor profile. YapYap never runs without its sandbox.';

export interface SandboxSwitches {
  hasSwitch(name: string): boolean;
}

/**
 * True when Chromium's sandbox was turned off: by `--no-sandbox`, which an
 * AppImage launcher adds on its own when user namespaces are restricted, or
 * by `ELECTRON_DISABLE_SANDBOX`.
 */
export function sandboxDisabled(
  switches: SandboxSwitches,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return switches.hasSwitch('no-sandbox') || (env['ELECTRON_DISABLE_SANDBOX'] ?? '') !== '';
}

export interface UnsafeStartDependencies {
  readonly whenReady: () => Promise<unknown>;
  /** Explains the problem; true when the user asks for the troubleshooting guide. */
  readonly explain: (message: string) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly logError: (message: string) => void;
  readonly quit: () => void;
}

/**
 * Explains why YapYap will not run, then quits, without ever opening
 * WhatsApp or a session. Running unsandboxed is never an option.
 */
export async function refuseUnsafeStart(deps: UnsafeStartDependencies): Promise<void> {
  deps.logError(UNSAFE_START_MESSAGE);
  await deps.whenReady();
  if (await deps.explain(UNSAFE_START_MESSAGE)) {
    await deps.openExternal(TROUBLESHOOTING_URL).catch(() => undefined);
  }
  deps.quit();
}
