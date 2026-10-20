import { CHROME_CHANNELS, type AboutInfo, type ChromeApi } from '../../shared/chrome-api.ts';

/**
 * Builds the chrome API from a single invoke function. Each operation has its
 * own fixed channel, so the page can never choose what it calls.
 */
export function createChromeBridge(invoke: (channel: string) => Promise<unknown>): ChromeApi {
  return {
    about: {
      info: () => invoke(CHROME_CHANNELS.aboutInfo) as Promise<AboutInfo>,
      copyTechnicalDetails: async () => {
        await invoke(CHROME_CHANNELS.copyTechnicalDetails);
      },
    },
  };
}
