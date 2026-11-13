import { ASSISTANT_BAR_CHANNELS, BAR_BUTTON_IDS } from '../../shared/api/assistant-bar-api.ts';
import { argumentsOf, noArguments, type PayloadCheck } from '../ipc/arguments.ts';
import {
  registerWhatsAppListeners,
  type WhatsAppIpc,
  type WhatsAppListener,
  type WhatsAppSenders,
} from '../ipc/whatsapp.ts';
import type { AssistantBar } from './bar.ts';
import { POLISH_STYLES } from './rewrites.ts';

/** More suggestions than the assistant ever shows. */
const MAX_SUGGESTIONS = 5;

export interface BarIpcDependencies extends WhatsAppSenders {
  /** The page of the account on screen, the only one whose bar is shown. */
  readonly activePage: () => object;
  /** Opens Settings, where the assistant is the first section. */
  readonly openSettings: () => void;
}

const isIndex = (index: unknown): boolean =>
  Number.isInteger(index) && Number(index) >= 0 && Number(index) < MAX_SUGGESTIONS;

const isStyle = (value: unknown): boolean => (POLISH_STYLES as readonly unknown[]).includes(value);

const isButton = (id: unknown): boolean => (BAR_BUTTON_IDS as readonly unknown[]).includes(id);

type BarActions = Pick<AssistantBar, 'polish' | 'use' | 'dismiss' | 'button'>;

/**
 * Hears the assistant's clicks from WhatsApp's page (ADR 0013). Only the active
 * account's WhatsApp view is heard, and only with the arguments each action
 * takes; anything else is dropped and logged without its content.
 */
export function listenToAssistantBar(
  ipc: WhatsAppIpc,
  bar: BarActions,
  deps: BarIpcDependencies,
): void {
  const on = (
    channel: string,
    accepts: PayloadCheck,
    act: (...args: never[]) => unknown,
  ): WhatsAppListener => ({
    channel,
    accepts,
    handle: ({ sender }, ...args) => {
      if (sender !== deps.activePage()) {
        deps.warn('Ignored an assistant bar message from outside the bar.');
        return;
      }
      Promise.resolve()
        .then(() => act(...(args as never[])))
        .catch(() => {
          deps.warn('An assistant bar action failed.');
        });
    },
  });
  const channels = ASSISTANT_BAR_CHANNELS;
  registerWhatsAppListeners(ipc, deps, [
    on(channels.polish, argumentsOf(isStyle), bar.polish),
    on(channels.use, argumentsOf(isIndex), bar.use),
    on(channels.dismiss, noArguments, bar.dismiss),
    on(channels.button, argumentsOf(isButton), bar.button),
    on(channels.settings, noArguments, deps.openSettings),
  ]);
}
