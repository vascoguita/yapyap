import type { ReadChat } from '../../adapter/active-chat.ts';
import type { AssistantBarState, BarButtonId } from '../../shared/api/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';
import { problemWords, privateWords, setupWords, type Fix, type Words } from './bar-words.ts';
import type { AllowedChats } from './chats.ts';
import type { AssistantCore } from './core.ts';
import type { PrivateModels } from './private/private-model.ts';
import { ProviderError } from './providers/provider.ts';
import { INSTRUCTIONS, suggestionsIn, transcriptOf } from './replies.ts';
import {
  cleanRewrite,
  isPolishStyle,
  POLISH_STYLES,
  rewriteInstructions,
  type PolishStyle,
} from './rewrites.ts';
import type { Setup } from './setup.ts';

/** What the assistant needs of the account on screen; nothing here sends a message. */
export interface BarAccounts {
  /** The account on screen; '' before there is one. */
  readonly active: () => string;
  /** Its open chat and last `messages` messages; null when no chat is open. */
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  readonly readDraft: () => Promise<string | null>;
  /** Puts `text` in the open chat's message box in place of the draft; false when none is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
}

export interface BarDependencies {
  readonly core: AssistantCore;
  readonly settings: Pick<SettingsService, 'current'>;
  readonly chats: Pick<AllowedChats, 'isAllowed'>;
  readonly accounts: BarAccounts;
  readonly privateModels: Pick<PrivateModels, 'status' | 'download' | 'smaller' | 'outOfMemory'>;
  readonly openSettings: () => void;
  /** Runs `run` after `ms`; returns how to call it off. */
  readonly after: (ms: number, run: () => void) => () => void;
  /** Shows the assistant in the page, or takes it away. */
  readonly show: (visible: boolean) => void;
  /** Sends the state to the page. */
  readonly publish: (state: AssistantBarState) => void;
}

/** What the assistant holds between clicks. */
interface BarContext {
  readonly deps: BarDependencies;
  state: AssistantBarState;
  /** The chat the shown suggestions or notice were made for. */
  chat: string | null;
  /** The draft Undo puts back. */
  kept: string;
  /** What the notice's fix button does. */
  fix: Fix;
  /** The notice says what keeps the assistant from answering, which goes once it can. */
  blocked: boolean;
  /** A rewrite runs; another click waits for it. */
  busy: boolean;
  /** The suggestions being made, called off when a newer message or another chat makes them stale. */
  suggesting: AbortController | undefined;
  /** Suggestions made for recent messages, by message, so a chat opened again shows the same ones. */
  readonly made: Map<string, readonly string[]>;
}

const text = en.assistant;
const MAX_SUGGESTION = 1000;
/** As many messages' suggestions as are remembered; a chat further back asks again. */
const MADE_KEPT = 20;
/**
 * How long a message must be the newest before suggestions are made for
 * it, so a burst of messages, or chats opened one after another, asks once.
 */
export const SETTLE_MS = 600;

const EMPTY: AssistantBarState = {
  working: false,
  suggestions: [],
  notice: null,
  polish: POLISH_STYLES[0],
  model: '',
};

function update(bar: BarContext, next: Partial<AssistantBarState>): void {
  if ('notice' in next) {
    console.error(`[dbg] ${new Date().toISOString().slice(17,23)} notice=${String(next.notice?.text ?? null)} from=${String(new Error().stack?.split('\n')[2]?.trim())}`);
  }
  bar.state = { ...bar.state, ...next };
  bar.deps.publish(bar.state);
}

/** Shows `words` above the message box, with its fix as the notice's button. */
function say(bar: BarContext, { status, fix }: Words): void {
  bar.fix = fix?.action ?? bar.fix;
  const button = fix === undefined ? null : { id: 'fix' as const, label: fix.label };
  update(bar, { notice: { text: status, button } });
}

/** The model in use, by name, or what keeps the assistant from having one. */
function modelName(setup: Setup): string {
  if (setup.missing !== '') {
    return text.composer.noModel;
  }
  return setup.models.find(({ id }) => id === setup.model)?.label ?? setup.model;
}

/** The setup, if the assistant can answer; else the notice says what is missing and how to fix it. */
async function ready(bar: BarContext): Promise<Setup | undefined> {
  const setup = await bar.deps.core.setup();
  update(bar, { model: modelName(setup) });
  if (setup.missing !== '') {
    bar.blocked = true;
    say(bar, setupWords(setup, await bar.deps.privateModels.status()));
    return undefined;
  }
  if (bar.blocked) {
    bar.blocked = false;
    update(bar, { notice: null });
  }
  return setup;
}

const assistantSettings = (bar: BarContext) => bar.deps.settings.current().assistant;

/** Whether the user lets the assistant read `name`: every chat, or the ones they listed (#107). */
const mayRead = (bar: BarContext, name: string): boolean =>
  assistantSettings(bar).chats === 'all' ||
  bar.deps.chats.isAllowed(bar.deps.accounts.active(), name);

/** Explains a failed rewrite; a private model short of memory offers the smaller one. */
async function failed(bar: BarContext, setup: Setup, error: unknown): Promise<void> {
  const kind = error instanceof ProviderError ? error.kind : 'failed';
  if (kind === 'out-of-memory') {
    bar.deps.privateModels.outOfMemory();
  }
  const { smaller } = await bar.deps.privateModels.status();
  say(bar, problemWords(kind, setup.provider, smaller));
}

/**
 * Puts the rewrite of `draft` in its place, and keeps `draft` for Undo.
 * A draft the user changed while the model answered is theirs, so it is
 * left as it is, and so is a chat the user left (#609).
 */
async function putInPlace(
  bar: BarContext,
  style: PolishStyle,
  rewritten: string,
  { draft, chat }: { readonly draft: string; readonly chat: string },
): Promise<void> {
  if (rewritten === '') {
    say(bar, { status: text.status.nothing });
    return;
  }
  const open = await bar.deps.accounts.readActiveChat(1);
  if (open?.name !== chat) {
    return;
  }
  if ((await bar.deps.accounts.readDraft()) !== draft) {
    say(bar, { status: text.status.draftChanged });
    return;
  }
  if (await bar.deps.accounts.replaceDraft(rewritten)) {
    bar.kept = draft;
    bar.chat = chat;
    const button = { id: 'undo' as const, label: text.bar.undo };
    update(bar, { suggestions: [], notice: { text: text.bar.done[style], button } });
  }
}

/** The draft to rewrite in the open chat, if there is one and the assistant may work there. */
async function draftToRewrite(
  bar: BarContext,
): Promise<{ readonly draft: string; readonly chat: string } | undefined> {
  const chat = await bar.deps.accounts.readActiveChat(1);
  if (chat === null) {
    return undefined;
  }
  if (!mayRead(bar, chat.name)) {
    bar.fix = 'settings';
    update(bar, {
      notice: { text: text.status.notAllowed, button: { id: 'fix', label: text.bar.openSettings } },
    });
    return undefined;
  }
  const draft = await bar.deps.accounts.readDraft();
  return draft === null || draft.trim() === '' ? undefined : { draft, chat: chat.name };
}

/** Rewrites the draft in `style` and puts the rewrite in its place; it never sends it. */
async function rewrite(bar: BarContext, style: PolishStyle): Promise<void> {
  const setup = await ready(bar);
  const found = setup === undefined ? undefined : await draftToRewrite(bar);
  if (setup === undefined || found === undefined) {
    return;
  }
  update(bar, { working: true, notice: null });
  let answer: string;
  try {
    answer = await bar.deps.core.ask(setup, rewriteInstructions(style), found.draft);
  } catch (error) {
    update(bar, { working: false });
    await failed(bar, setup, error);
    return;
  }
  update(bar, { working: false });
  await putInPlace(bar, style, cleanRewrite(answer), found);
}

/** Rewrites the draft in one of the button's ways, which it then keeps; one rewrite at a time. */
async function polish(bar: BarContext, value: string): Promise<void> {
  if (!isPolishStyle(value) || bar.busy) {
    return;
  }
  update(bar, { polish: value });
  bar.busy = true;
  try {
    await rewrite(bar, value);
  } finally {
    bar.busy = false;
  }
}

/** Takes away what the assistant shows about its chat, and calls off suggestions being made. */
function forget(bar: BarContext): void {
  bar.suggesting?.abort();
  bar.suggesting = undefined;
  bar.chat = null;
  bar.kept = '';
  bar.blocked = false;
  update(bar, { suggestions: [], notice: null });
}

/** Puts back the draft a rewrite replaced, while its chat is still open. */
async function undo(bar: BarContext): Promise<void> {
  const open = await bar.deps.accounts.readActiveChat(1);
  if (open !== null && open.name === bar.chat) {
    await bar.deps.accounts.replaceDraft(bar.kept);
  }
  update(bar, { notice: null });
}

const FIXES: Readonly<Record<Fix, (deps: BarDependencies) => unknown>> = {
  settings: (deps) => {
    deps.openSettings();
  },
  resume: (deps) => {
    deps.privateModels.download();
  },
  smaller: (deps) => deps.privateModels.smaller(),
};

const BUTTONS: Readonly<Record<BarButtonId, (bar: BarContext) => unknown>> = {
  undo,
  fix: (bar) => FIXES[bar.fix](bar.deps),
  close: (bar) => {
    update(bar, { notice: null });
  },
};

/** Presses the notice's button, or its close; any other is dropped. */
async function press(bar: BarContext, id: BarButtonId): Promise<void> {
  const shown = bar.state.notice;
  if (shown !== null && (id === 'close' || shown.button?.id === id)) {
    await BUTTONS[id](bar);
  }
}

/** Puts the suggestion at `index` in the message box, if its chat is still open; it never sends it. */
async function use(bar: BarContext, index: number): Promise<void> {
  const suggestion = bar.state.suggestions[index];
  const open = suggestion === undefined ? null : await bar.deps.accounts.readActiveChat(1);
  if (open !== null && open.name === bar.chat) {
    update(bar, { suggestions: [] });
    await bar.deps.accounts.replaceDraft(String(suggestion));
  }
}

/** Keeps the suggestions made for `message`, forgetting the oldest beyond {@link MADE_KEPT}. */
function remember(bar: BarContext, message: string, suggestions: readonly string[]): void {
  bar.made.delete(message);
  bar.made.set(message, suggestions);
  for (const old of [...bar.made.keys()].slice(0, -MADE_KEPT)) {
    bar.made.delete(old);
  }
}

/** Hides the suggestions until another message arrives, even if this chat is opened again. */
function dismiss(bar: BarContext, message: string | null): void {
  if (message !== null) {
    remember(bar, message, []);
  }
  update(bar, { suggestions: [] });
}

/** The open chat, if the user wants suggestions there and its last message is someone else's. */
async function chatToAnswer(bar: BarContext): Promise<ReadChat | undefined> {
  const chat = await bar.deps.accounts.readActiveChat(Number(assistantSettings(bar).messages));
  const theirs = chat?.messages.at(-1)?.outgoing === false;
  return chat !== null && theirs && mayRead(bar, chat.name) ? chat : undefined;
}

const isAborted = (signal: AbortSignal): boolean => signal.aborted;

/** Asks for suggestions for the open chat; nothing shows if it fails or it went stale. */
async function makeSuggestions(bar: BarContext, message: string, signal: AbortSignal) {
  const setup = await bar.deps.core.setup();
  const chat = setup.missing === '' ? await chatToAnswer(bar) : undefined;
  if (chat === undefined || signal.aborted) {
    return;
  }
  const transcript = transcriptOf(chat, Number(assistantSettings(bar).messages));
  const answer = await bar.deps.core.ask(setup, INSTRUCTIONS, transcript, signal);
  // A newer message or another chat may have called the request off while the model answered.
  if (isAborted(signal)) {
    return;
  }
  const suggestions = suggestionsIn(answer).map((item) => item.slice(0, MAX_SUGGESTION));
  remember(bar, message, suggestions);
  bar.chat = chat.name;
  update(bar, { suggestions });
}

/** Waits until `message` settled as the newest; false if a newer one or another chat came first. */
const settled = (bar: BarContext, signal: AbortSignal): Promise<boolean> =>
  new Promise((done) => {
    const cancel = bar.deps.after(SETTLE_MS, () => {
      done(true);
    });
    signal.addEventListener('abort', () => {
      cancel();
      done(false);
    });
  });

/**
 * Suggests replies to `message`, the open chat's newest, from someone
 * else. Suggestions already made for it show again, and none show after
 * the user dismissed them.
 */
async function suggest(bar: BarContext, message: string): Promise<void> {
  bar.suggesting?.abort();
  const known = assistantSettings(bar).autoSuggest ? bar.made.get(message) : [];
  if (known !== undefined) {
    update(bar, { suggestions: known });
    return;
  }
  const controller = new AbortController();
  bar.suggesting = controller;
  update(bar, { suggestions: [] });
  if (await settled(bar, controller.signal)) {
    // A failed request shows nothing: suggestions come on their own, and a rewrite says what fails.
    await makeSuggestions(bar, message, controller.signal).catch(() => undefined);
  }
}

/** Download progress replaces a notice about the private model; a ready model takes it away. */
async function followDownload(bar: BarContext): Promise<void> {
  if (!bar.blocked) {
    return;
  }
  const status = await bar.deps.privateModels.status();
  if (status.phase.kind === 'ready' || status.phase.kind === 'none') {
    await ready(bar);
    return;
  }
  say(bar, privateWords(status));
}

/** Names the model in use; a notice about the setup shows how it stands now, or goes. */
async function refresh(bar: BarContext): Promise<void> {
  if (bar.blocked) {
    await ready(bar);
  } else {
    update(bar, { model: modelName(await bar.deps.core.setup()) });
  }
}

/** What the assistant does with the user's clicks, and with the open chat as it changes. */
export interface AssistantBar {
  readonly state: () => AssistantBarState;
  /** Shows or hides the assistant as the settings say, with the model in use and how the setup stands. */
  readonly refresh: () => Promise<void>;
  /** Rewrites the draft in place in one of the rewrite button's ways, and keeps that way. */
  readonly polish: (value: string) => Promise<void>;
  readonly use: (index: number) => Promise<void>;
  readonly dismiss: () => void;
  readonly button: (id: BarButtonId) => Promise<void>;
  /** The open chat was first seen, with `message` its newest from someone else if it is the last one. */
  readonly found: (message: string | null) => void;
  /** Another chat is open, with `message` its newest from someone else if it is the last one. */
  readonly opened: (message: string | null) => void;
  /** A message from someone else arrived in the open chat, and is its last. */
  readonly arrived: (message: string) => void;
  /** The user sent a message in the open chat. */
  readonly sent: () => void;
  /** The private model changed; its download's progress shows while a notice is about it. */
  readonly privateModelChanged: () => Promise<void>;
}

/**
 * The chat was first found after the notice showed, as when the user
 * rewrote right after YapYap started: the notice stays with its draft,
 * and goes if the message box is empty, as after a send nobody saw.
 */
async function keepNotice(bar: BarContext): Promise<void> {
  if (bar.state.notice === null) {
    return;
  }
  const draft = await bar.deps.accounts.readDraft().catch(() => undefined);
  if (draft !== undefined && (draft ?? '').trim() === '') {
    update(bar, { notice: null });
  }
}

/** What the assistant does as the open chat changes, and with the suggestions' dismiss. */
function followChat(
  bar: BarContext,
): Pick<AssistantBar, 'dismiss' | 'found' | 'opened' | 'arrived' | 'sent'> {
  // The open chat's newest message from someone else, while it is the last one.
  let message: string | null = null;
  const follow = (newest: string | null): void => {
    message = newest;
    if (newest !== null) {
      void suggest(bar, newest);
    }
  };
  return {
    dismiss: () => {
      dismiss(bar, message);
    },
    found: (newest) => {
      follow(newest);
      void keepNotice(bar);
    },
    opened: (newest) => {
      forget(bar);
      follow(newest);
    },
    arrived: (newest) => {
      message = newest;
      void suggest(bar, newest);
    },
    sent: () => {
      message = null;
      bar.suggesting?.abort();
      update(bar, { suggestions: [], notice: null });
    },
  };
}

/**
 * The assistant in the open chat's message box (ADR 0013, ADR 0017): the
 * rewrite button, and the suggestions and notices right above the box. It
 * reads a chat only where the user lets it, acts only on the user's
 * clicks, and never sends a message: it only puts text in the message box.
 */
export function createAssistantBar(deps: BarDependencies): AssistantBar {
  const bar: BarContext = {
    deps,
    state: EMPTY,
    chat: null,
    kept: '',
    fix: 'settings',
    blocked: false,
    busy: false,
    suggesting: undefined,
    made: new Map(),
  };
  return {
    state: () => bar.state,
    refresh: async () => {
      deps.show(deps.settings.current().assistant.enabled);
      await refresh(bar);
    },
    polish: (value) => polish(bar, value),
    use: (index) => use(bar, index),
    button: (id) => press(bar, id),
    privateModelChanged: () => followDownload(bar),
    ...followChat(bar),
  };
}
