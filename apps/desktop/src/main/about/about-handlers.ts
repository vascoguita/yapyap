import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { buildAboutInfo, formatTechnicalDetails, type RuntimeFacts } from './about-info.ts';

export interface AboutSources {
  readonly facts: () => RuntimeFacts;
  readonly writeClipboard: (text: string) => Promise<unknown>;
}

/** The About window's operations: its details, and copying them. */
export function aboutHandlers(sources: AboutSources): ChromeHandler[] {
  const info = () => buildAboutInfo(sources.facts());
  return [
    { channel: CHROME_CHANNELS.aboutInfo, accepts: noArguments, handle: info },
    {
      channel: CHROME_CHANNELS.copyTechnicalDetails,
      accepts: noArguments,
      handle: () => sources.writeClipboard(formatTechnicalDetails(info())),
    },
  ];
}
