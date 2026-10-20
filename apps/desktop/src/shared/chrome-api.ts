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
}

export const CHROME_CHANNELS = {
  aboutInfo: 'about:info',
  copyTechnicalDetails: 'about:copy-technical-details',
  recoveryProblem: 'recovery:problem',
  recoveryRetry: 'recovery:retry',
  recoveryClearCache: 'recovery:clear-cache',
  recoveryCopyDiagnostics: 'recovery:copy-diagnostics',
} as const;
