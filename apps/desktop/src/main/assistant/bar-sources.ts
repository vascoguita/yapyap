import type { AssistantRequest } from '@yapyap/extension-sdk';
import type { AssistantBarState } from '../../shared/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import { createAssistantBar, type AssistantBar } from './bar.ts';

/** Where the bar shows and sends its state, once the main window has accounts. */
export interface AssistantBarView {
  readonly show: (visible: boolean) => void;
  readonly publish: (state: AssistantBarState) => void;
}

/** What the bar needs of the extension runtime and of the accounts. */
export interface BarSources {
  readonly runtime: {
    readonly assistants: () => readonly { readonly id: string; readonly name: string }[];
    readonly askAssistant: (extension: string, request: AssistantRequest) => boolean;
    readonly onChange: (listener: () => void) => void;
  };
  readonly accounts: {
    readonly readActiveChat: (messages: number) => Promise<{ readonly name: string } | null>;
    readonly replaceDraft: (text: string) => Promise<boolean>;
    readonly pressEnter: () => Promise<boolean>;
  };
}

/**
 * The bar, filled by the runtime's extensions, and how to give it its view
 * once the accounts are open; the view is made from the bar, since it hears
 * the bar's clicks too.
 */
export function assistantBarFor({ runtime, accounts }: BarSources): {
  readonly bar: AssistantBar;
  readonly attach: (create: (bar: AssistantBar) => AssistantBarView) => void;
} {
  const view: { current?: AssistantBarView } = {};
  const bar = createAssistantBar(
    {
      extensions: runtime.assistants,
      ask: runtime.askAssistant,
      // One message is enough to name the chat, which is all the bar keeps of it.
      chatName: async () => {
        const chat = await accounts.readActiveChat(1);
        return chat?.name ?? null;
      },
      replaceDraft: accounts.replaceDraft,
      pressEnter: accounts.pressEnter,
      show: (visible) => view.current?.show(visible),
      publish: (state) => view.current?.publish(state),
    },
    en.assistantBar,
  );
  runtime.onChange(bar.refresh);
  return {
    bar,
    attach: (create) => {
      view.current = create(bar);
      bar.refresh();
    },
  };
}
