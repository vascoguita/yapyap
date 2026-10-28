import type { AssistantRequest } from '@yapyap/extension-sdk';
import {
  ASSISTANT_BAR_STATE_EVENT,
  CHROME_CHANNELS,
  type AssistantBarState,
} from '../../shared/chrome-api.ts';
import { CHROME_ORIGIN } from '../chrome/assets.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { ViewRegistry } from '../views.ts';
import { en } from '../../shared/messages/en.ts';
import { createAssistantBar, type AssistantBar } from './bar.ts';

/** Tall enough for a row of suggestions and the field to write a message. */
const ASSISTANT_BAR_HEIGHT = 112;
/** Longest request a user can type in the bar. */
const MAX_PROMPT = 2000;
/** As many suggestions as an extension may offer. */
const MAX_SUGGESTIONS = 5;

export interface AssistantBarPort {
  readonly webContents: {
    loadURL(url: string): Promise<unknown>;
    send(channel: string, state: AssistantBarState): void;
  };
  /** Zero takes the bar away and gives WhatsApp the whole height. */
  readonly setHeight: (height: number) => void;
}

/** Where the bar shows and sends its state, once the main window has one. */
export interface AssistantBarView {
  readonly show: (visible: boolean) => void;
  readonly publish: (state: AssistantBarState) => void;
}

const BAR_VIEW = { zone: 'chrome', home: CHROME_ORIGIN, label: PRODUCT_NAME } as const;

/**
 * Docks the bar beneath the accounts' WhatsApp views when it has something
 * to show, loading its page on first use; the page asks for the state
 * itself, so nothing is lost while it loads.
 */
export function attachAssistantBar(
  port: AssistantBarPort,
  views: ViewRegistry,
  warn: (message: string) => void,
): AssistantBarView {
  let loaded = false;
  views.set(port.webContents, BAR_VIEW);
  return {
    show: (visible) => {
      port.setHeight(visible ? ASSISTANT_BAR_HEIGHT : 0);
      if (visible && !loaded) {
        loaded = true;
        port.webContents.loadURL(`${CHROME_ORIGIN}/assistant-bar.html`).catch(() => {
          warn('Could not load the assistant bar.');
        });
      }
    },
    publish: (state) => {
      port.webContents.send(ASSISTANT_BAR_STATE_EVENT, state);
    },
  };
}

const isIndex = ([index, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 &&
  Number.isInteger(index) &&
  (index as number) >= 0 &&
  (index as number) < MAX_SUGGESTIONS;

const isPrompt = ([text, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 && typeof text === 'string' && text.trim() !== '' && text.length <= MAX_PROMPT;

/** The bar's operations, each acting only on the user's click (ADR 0013). */
export function assistantBarHandlers(bar: AssistantBar): ChromeHandler[] {
  return [
    { channel: CHROME_CHANNELS.assistantBarState, accepts: noArguments, handle: bar.state },
    { channel: CHROME_CHANNELS.assistantBarSuggest, accepts: noArguments, handle: bar.suggest },
    {
      channel: CHROME_CHANNELS.assistantBarPrompt,
      accepts: isPrompt,
      handle: (_call, text) => bar.prompt((text as string).trim()),
    },
    { channel: CHROME_CHANNELS.assistantBarConfirm, accepts: noArguments, handle: bar.confirm },
    {
      channel: CHROME_CHANNELS.assistantBarUse,
      accepts: isIndex,
      handle: (_call, index) => bar.use(index as number),
    },
    {
      channel: CHROME_CHANNELS.assistantBarSend,
      accepts: isIndex,
      handle: (_call, index) => bar.send(index as number),
    },
  ];
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

/** The bar, filled by the runtime's extensions, and how to give it its view once the window has one. */
export function assistantBarFor({ runtime, accounts }: BarSources): {
  readonly bar: AssistantBar;
  readonly attach: (view: AssistantBarView) => void;
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
    attach: (given) => {
      view.current = given;
      bar.refresh();
    },
  };
}
