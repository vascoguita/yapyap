import { MAX_PROMPT } from '../../adapter/assistant-bar.ts';
import { ASSISTANT_BAR_CHANNELS } from '../../shared/assistant-bar-api.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';
import type { ViewRegistry } from '../views.ts';
import type { AssistantBar } from './bar.ts';

/** As many suggestions as an extension may offer. */
const MAX_SUGGESTIONS = 5;

interface BarIpcEvent {
  readonly sender: object;
  readonly senderFrame: { readonly url: string } | null;
}

export interface BarIpc {
  on(channel: string, listener: (event: BarIpcEvent, ...args: unknown[]) => void): unknown;
}

export interface BarIpcDependencies {
  readonly views: ViewRegistry;
  readonly origin: string;
  /** The page of the account on screen, the only one whose bar is shown. */
  readonly activePage: () => object;
  readonly warn: (message: string) => void;
}

const isIndex = (args: readonly unknown[]): args is [number] => {
  const [index, ...rest] = args;
  return (
    rest.length === 0 &&
    Number.isInteger(index) &&
    Number(index) >= 0 &&
    Number(index) < MAX_SUGGESTIONS
  );
};

const isPrompt = (args: readonly unknown[]): args is [string] => {
  const [text, ...rest] = args;
  return (
    rest.length === 0 && typeof text === 'string' && text.trim() !== '' && text.length <= MAX_PROMPT
  );
};

const noArguments = (args: readonly unknown[]): args is [] => args.length === 0;

/** The bar's choice offers at most this long a value; the bar then checks it was offered. */
const MAX_CHOICE = 100;

const isChoice = (args: readonly unknown[]): args is [string] => {
  const [value, ...rest] = args;
  return (
    rest.length === 0 && typeof value === 'string' && value !== '' && value.length <= MAX_CHOICE
  );
};

/**
 * Hears the bar's clicks from WhatsApp's page (ADR 0013). Only the active
 * account's WhatsApp view, on WhatsApp's own origin, is heard, and only with
 * the arguments each action takes; anything else is dropped and logged
 * without its content.
 */
export function listenToAssistantBar(
  ipc: BarIpc,
  bar: Pick<AssistantBar, 'suggest' | 'prompt' | 'confirm' | 'use' | 'send' | 'choose'>,
  deps: BarIpcDependencies,
): void {
  const fromBar = ({ sender, senderFrame }: BarIpcEvent): boolean =>
    deps.views.get(sender)?.zone === 'whatsapp' &&
    sender === deps.activePage() &&
    isSameOrigin(senderFrame?.url ?? '', deps.origin);
  const on = <Args extends unknown[]>(
    channel: string,
    accepts: (args: readonly unknown[]) => args is Args,
    act: (...args: Args) => unknown,
  ): void => {
    ipc.on(channel, (event, ...args) => {
      if (!fromBar(event) || !accepts(args)) {
        deps.warn('Ignored an assistant bar message from outside the bar.');
        return;
      }
      Promise.resolve()
        .then(() => act(...args))
        .catch(() => {
          deps.warn('An assistant bar action failed.');
        });
    });
  };
  on(ASSISTANT_BAR_CHANNELS.suggest, noArguments, bar.suggest);
  on(ASSISTANT_BAR_CHANNELS.prompt, isPrompt, (text) => bar.prompt(text.trim()));
  on(ASSISTANT_BAR_CHANNELS.confirm, noArguments, bar.confirm);
  on(ASSISTANT_BAR_CHANNELS.use, isIndex, bar.use);
  on(ASSISTANT_BAR_CHANNELS.send, isIndex, bar.send);
  on(ASSISTANT_BAR_CHANNELS.choose, isChoice, bar.choose);
}
