import type { SettingValue } from './settings-fields.ts';

/** What the About window shows; built in main, rendered by the chrome renderer. */
export interface AboutInfo {
  readonly name: string;
  readonly version: string;
  readonly channel: string;
  readonly electron: string;
  readonly chromium: string;
  readonly node: string;
  readonly os: string;
  readonly license: string;
}

/** Why WhatsApp is not showing, as the recovery screen explains it. */
export interface RecoveryProblem {
  readonly kind: 'unsupported' | 'blank' | 'load-failed' | 'crashed';
  readonly description: string;
}

/** The settings window's view of the settings. */
export interface SettingsSnapshot {
  /** Keyed by field ID, for the fields in `SETTING_FIELDS`. */
  readonly values: Readonly<Record<string, SettingValue>>;
  /** A changed setting only takes effect after a restart. */
  readonly restartPending: boolean;
  /** The settings belong to a newer YapYap, so changes cannot be saved. */
  readonly readOnly: boolean;
}

/** The API the chrome preload exposes as `window.yapyap`, one function per operation. */
export interface ChromeApi {
  readonly about: {
    readonly info: () => Promise<AboutInfo>;
    readonly copyTechnicalDetails: () => Promise<void>;
  };
  readonly recovery: {
    readonly problem: () => Promise<RecoveryProblem | null>;
    readonly retry: () => Promise<void>;
    readonly clearCache: () => Promise<void>;
    readonly copyDiagnostics: () => Promise<void>;
  };
  readonly settings: {
    readonly get: () => Promise<SettingsSnapshot>;
    readonly set: (id: string, value: SettingValue) => Promise<SettingsSnapshot>;
    readonly restart: () => Promise<void>;
  };
}

export const CHROME_CHANNELS = {
  aboutInfo: 'about:info',
  copyTechnicalDetails: 'about:copy-technical-details',
  recoveryProblem: 'recovery:problem',
  recoveryRetry: 'recovery:retry',
  recoveryClearCache: 'recovery:clear-cache',
  recoveryCopyDiagnostics: 'recovery:copy-diagnostics',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsRestart: 'settings:restart',
} as const;
