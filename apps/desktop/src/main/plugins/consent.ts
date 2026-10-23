import { CHROME_CHANNELS, type PluginConsent } from '../../shared/chrome-api.ts';
import { noArguments, type ChromeCall, type ChromeHandler } from '../chrome/ipc.ts';

export interface ConsentWindow {
  readonly webContents: object;
  close(): void;
  /** Called once the window is gone, however it was closed. */
  onClosed(listener: () => void): void;
}

export interface PluginConsentPrompt {
  /** Resolves true only when the user installs; false if they cancel or a prompt is already open. */
  readonly ask: (consent: PluginConsent) => Promise<boolean>;
  readonly handlers: readonly ChromeHandler[];
}

interface ActivePrompt {
  readonly window: ConsentWindow;
  readonly consent: PluginConsent;
  readonly settle: (install: boolean) => void;
}

const answerArguments = (args: readonly unknown[]): boolean =>
  args.length === 2 && typeof args[0] === 'boolean' && typeof args[1] === 'boolean';

/**
 * Only YapYap's own key is reviewed by YapYap, so any other plugin installs
 * only once the user says they accept the risk, whatever the page shows.
 */
function allowed(consent: PluginConsent, acknowledged: boolean): boolean {
  return consent.trust === 'first-party' || acknowledged;
}

function consentHandlers(owned: (call: ChromeCall) => ActivePrompt): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.pluginsConsent,
      accepts: noArguments,
      handle: (call) => owned(call).consent,
    },
    {
      channel: CHROME_CHANNELS.pluginsAnswer,
      accepts: answerArguments,
      handle: (call, install, acknowledged) => {
        const prompt = owned(call);
        if (install === true && !allowed(prompt.consent, acknowledged === true)) {
          throw new Error('A plugin YapYap has not reviewed needs the user to accept the risk.');
        }
        prompt.settle(install === true);
      },
    },
  ];
}

/**
 * Asks the user about one plugin install at a time, in its own window. Only
 * that window can answer, and closing it counts as a refusal.
 */
export function createPluginConsent(open: () => ConsentWindow): PluginConsentPrompt {
  let active: ActivePrompt | undefined;
  const owned = ({ sender }: ChromeCall): ActivePrompt => {
    if (active?.window.webContents !== sender) {
      throw new Error('No plugin install belongs to this window.');
    }
    return active;
  };
  return {
    ask: (consent) => {
      if (active !== undefined) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        const window = open();
        const settle = (install: boolean): void => {
          if (active?.window !== window) {
            return;
          }
          active = undefined;
          resolve(install);
          window.close();
        };
        active = { window, consent, settle };
        window.onClosed(() => {
          settle(false);
        });
      });
    },
    handlers: consentHandlers(owned),
  };
}
