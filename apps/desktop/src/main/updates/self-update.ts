import type { UpdatePolicy } from './update-policy.ts';
import { NOTICE_INTERVAL_MS } from './update-notice.ts';

/** The part of electron-updater's `autoUpdater` YapYap relies on. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  checkForUpdates(): Promise<unknown>;
  on(event: 'update-downloaded', listener: (info: { readonly version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  quitAndInstall(): void;
}

export interface SelfUpdateDependencies {
  readonly policy: UpdatePolicy;
  /** Asks whether to restart now and install `version`; true when the user agrees. */
  readonly askToInstall: (version: string) => Promise<boolean>;
  readonly every: (callback: () => void, ms: number) => unknown;
  readonly warn: (message: string) => void;
}

/**
 * For builds that can update themselves (ADR 0003), downloads new stable
 * releases in the background and installs one only when the user agrees to
 * restart. electron-updater checks each download's SHA-512 against the
 * release metadata, and macOS checks the code signature, before anything
 * installs. Pre-releases and downgrades are never offered, and every other
 * policy makes no request at all.
 */
export function startSelfUpdates(createUpdater: () => Updater, deps: SelfUpdateDependencies): void {
  if (deps.policy !== 'self-update') {
    return;
  }
  // Created only here: electron-updater sets up platform machinery as soon as it exists.
  const updater = createUpdater();
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('error', () => {
    deps.warn('Could not check for or download a YapYap update.');
  });
  updater.on('update-downloaded', ({ version }) => {
    deps.askToInstall(version).then(
      (agreed) => {
        if (agreed) {
          updater.quitAndInstall();
        }
      },
      () => {
        deps.warn('Could not ask about installing a YapYap update.');
      },
    );
  });
  const check = (): void => {
    updater.checkForUpdates().catch(() => {
      deps.warn('Could not check for or download a YapYap update.');
    });
  };
  check();
  deps.every(check, NOTICE_INTERVAL_MS);
}
