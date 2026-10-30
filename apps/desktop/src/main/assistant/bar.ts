import type { AssistantOffer, AssistantRequest } from '@yapyap/extension-sdk';
import type { AssistantBarState } from '../../shared/assistant-bar-api.ts';

/** A running extension that may fill the bar for the account on screen. */
interface BarExtension {
  readonly id: string;
  readonly name: string;
}

export interface AssistantBarDependencies {
  /** Running extensions holding `assistant:bar` for the account on screen, in start order. */
  readonly extensions: () => readonly BarExtension[];
  /** Passes the user's request to the extension; false when it no longer runs. */
  readonly ask: (extension: string, request: AssistantRequest) => boolean;
  /** The open chat's name, to tie suggestions to it; null when no chat is open. */
  readonly chatName: () => Promise<string | null>;
  /** Puts `text` in the open chat's message box, replacing any draft; false when none is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** Presses Enter in the message box, as the user would to send. */
  readonly pressEnter: () => Promise<unknown>;
  /** Shows the bar, or takes it away. */
  readonly show: (visible: boolean) => void;
  /** Sends the bar's state to its page. */
  readonly publish: (state: AssistantBarState) => void;
}

/** What the bar does with the user's clicks, and what extensions offer it. */
export interface AssistantBar {
  readonly state: () => AssistantBarState;
  /** Looks again at which extensions may fill the bar, as the account or the extensions change. */
  readonly refresh: () => void;
  /** An extension's offer, shown only if it is the extension the bar serves. */
  readonly offer: (extension: string, offer: AssistantOffer) => void;
  readonly suggest: () => Promise<void>;
  readonly prompt: (text: string) => Promise<void>;
  readonly confirm: () => void;
  readonly use: (index: number) => Promise<void>;
  readonly send: (index: number) => Promise<void>;
  readonly choose: (value: string) => Promise<void>;
}

const EMPTY: AssistantBarState = {
  extension: '',
  status: '',
  suggestions: [],
  confirm: undefined,
  working: false,
  choice: undefined,
};

/** Status lines YapYap itself shows, in the user's words. */
export interface BarTexts {
  readonly noChat: string;
  readonly chatChanged: string;
  readonly thinking: string;
}

/** What the bar holds between clicks. */
interface BarContext {
  readonly deps: AssistantBarDependencies;
  readonly texts: BarTexts;
  state: AssistantBarState;
  serving: BarExtension | undefined;
  /** The chat the shown suggestions were made for. */
  chat: string | null;
}

function update(bar: BarContext, next: Partial<AssistantBarState>): void {
  bar.state = { ...bar.state, ...next };
  bar.deps.publish(bar.state);
}

/** Asks the extension, once the open chat is known, so its answer stays tied to that chat. */
async function askExtension(bar: BarContext, request: AssistantRequest): Promise<void> {
  if (bar.serving === undefined) {
    return;
  }
  bar.chat = await bar.deps.chatName();
  if (bar.chat === null) {
    update(bar, { status: bar.texts.noChat, suggestions: [], confirm: undefined, working: false });
    return;
  }
  update(bar, { status: bar.texts.thinking, suggestions: [], confirm: undefined, working: true });
  bar.deps.ask(bar.serving.id, request);
}

/** Puts the suggestion at `index` in the message box, if the chat it was made for is still open. */
async function pickSuggestion(bar: BarContext, index: number): Promise<boolean> {
  const text = bar.state.suggestions[index];
  if (text === undefined) {
    return false;
  }
  if ((await bar.deps.chatName()) !== bar.chat) {
    update(bar, { status: bar.texts.chatChanged, suggestions: [], confirm: undefined });
    return false;
  }
  return bar.deps.replaceDraft(text);
}

function refreshBar(bar: BarContext): void {
  const first = bar.deps.extensions()[0];
  if (first?.id !== bar.serving?.id) {
    bar.serving = first;
    bar.chat = null;
    bar.state = { ...EMPTY, extension: first?.name ?? '' };
    bar.deps.publish(bar.state);
  }
  bar.deps.show(bar.serving !== undefined);
}

/** Shows what the extension offers, keeping its last choice until it offers another. */
function showOffer(bar: BarContext, offer: AssistantOffer): void {
  const { status = '', suggestions, confirm, choice } = offer;
  const shown =
    choice === undefined
      ? bar.state.choice
      : { label: choice.label, current: choice.current, options: choice.options };
  update(bar, { status, suggestions, confirm, working: false, choice: shown });
}

/**
 * Passes the option the user picked, such as another model, to the
 * extension, and asks again with it if suggestions were showing (#467).
 * Only an option the extension offered is passed on.
 */
async function chooseOption(bar: BarContext, value: string): Promise<void> {
  const { choice } = bar.state;
  const offered = choice?.options.some((option) => option.value === value) === true;
  if (bar.serving === undefined || choice === undefined || !offered) {
    return;
  }
  bar.deps.ask(bar.serving.id, { type: 'choose', value });
  const asked = bar.state.suggestions.length > 0;
  update(bar, { choice: { ...choice, current: value } });
  if (asked) {
    await askExtension(bar, { type: 'suggest' });
  }
}

/**
 * The assistant bar above the open chat's message box (ADR 0013). It shows what the
 * first running extension holding `assistant:bar` offers, as plain text, and
 * acts only on the user's clicks: it asks the extension, puts a suggestion in
 * the message box, or sends one, after checking the chat it was made for is
 * still the one open.
 */
export function createAssistantBar(deps: AssistantBarDependencies, texts: BarTexts): AssistantBar {
  const bar: BarContext = {
    deps,
    texts,
    state: EMPTY,
    serving: undefined,
    chat: null,
  };
  return {
    state: () => bar.state,
    refresh: () => {
      refreshBar(bar);
    },
    offer: (extension, offer) => {
      if (extension === bar.serving?.id) {
        showOffer(bar, offer);
      }
    },
    suggest: () => askExtension(bar, { type: 'suggest' }),
    prompt: (text) => askExtension(bar, { type: 'prompt', text }),
    confirm: () => {
      if (bar.serving !== undefined && bar.state.confirm !== undefined) {
        update(bar, { confirm: undefined, working: true, status: texts.thinking });
        deps.ask(bar.serving.id, { type: 'confirm' });
      }
    },
    use: async (index) => {
      await pickSuggestion(bar, index);
    },
    send: async (index) => {
      if (await pickSuggestion(bar, index)) {
        await deps.pressEnter();
        update(bar, { suggestions: [], status: '' });
      }
    },
    choose: (value) => chooseOption(bar, value),
  };
}
