import {
  CHROME_CHANNELS,
  type AboutInfo,
  type ChromeApi,
  type RecoveryProblem,
} from '../../shared/chrome-api.ts';

/**
 * Builds the chrome API from a single invoke function. Each operation has its
 * own fixed channel, so the page can never choose what it calls.
 */
export function createChromeBridge(invoke: (channel: string) => Promise<unknown>): ChromeApi {
  const run = (channel: string) => async (): Promise<void> => {
    await invoke(channel);
  };
  return {
    about: {
      info: () => invoke(CHROME_CHANNELS.aboutInfo) as Promise<AboutInfo>,
      copyTechnicalDetails: run(CHROME_CHANNELS.copyTechnicalDetails),
    },
    recovery: {
      problem: () => invoke(CHROME_CHANNELS.recoveryProblem) as Promise<RecoveryProblem | null>,
      retry: run(CHROME_CHANNELS.recoveryRetry),
      clearCache: run(CHROME_CHANNELS.recoveryClearCache),
      copyDiagnostics: run(CHROME_CHANNELS.recoveryCopyDiagnostics),
    },
  };
}
