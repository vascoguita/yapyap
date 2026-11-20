import type { ReadChat } from '../../adapter/active-chat.ts';
import type { AssistantBarState, BarButtonId } from '../../shared/api/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';
import { problemWords, setupWords, type Words } from './bar-words.ts';
import type { AllowedChats } from './chats.ts';
import type { AssistantCore } from './core.ts';
import { ProviderError } from './providers/provider.ts';
import { suggestionsIn, suggestPrompt } from './replies.ts';
import {
  cleanRewrite,
  isPolishStyle,
  POLISH_STYLES,
  rewritePrompt,
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
  readonly openSettings: () => void;
  /** Runs `run` after `ms`; returns how to call it off. */
  readonly after: (ms: number, run: () => void) => () => void;
  /** Shows the assistant in the page, or takes it away. */
  readonly show: (visible: boolean) => void;
  /** Sends the state to the page. */
  readonly publish: (state: AssistantBarState) => void;
  /** The time now, which the model is told so it knows what "tomorrow" means. */
  readonly now: () => Date;
}

/** What the assistant holds between clicks. */
interface BarContext {
  readonly deps: BarDependencies;
  state: AssistantBarState;
  /** The chat the shown suggestions or notice were made for. */
  chat: string | null;
  /** The draft Undo puts back. */
  kept: string;
  /** The notice says what keeps the assistant from answering, which goes once it can. */
  blocked: boolean;
  /** A rewrite runs; another click waits for it. */
  busy: boolean;
  /** A rewrite filled the message box, which took the suggestions away until it empties. */
  rewritten: boolean;
  /** The suggestions being made, called off when a newer message or another chat makes them stale. */
  suggesting: AbortController | undefined;
  /** Suggestions made for recent messages, by message, so a chat opened again shows the same ones. */
  readonly made: Map<string, readonly string[]>;
  /** The item the notice's Try Again asks about again. */
  retryFor: string;
  /** The notice says why no suggestions came, which goes as soon as they are asked for again. */
  unsuggested: boolean;
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
  chat: null,
  collapsed: false,
  writing: false,
};

function update(bar: BarContext, next: Partial<AssistantBarState>): void {
  bar.state = { ...bar.state, ...next };
  bar.deps.publish(bar.state);
}

/** Shows `words` above the message box, with its fix as the notice's button. */
function say(bar: BarContext, { status, fix }: Words): void {
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
    say(bar, setupWords(setup));
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

/** Explains a failed rewrite, with a way to Settings where a key would mend it. */
function failed(bar: BarContext, setup: Setup, error: unknown): void {
  const kind = error instanceof ProviderError ? error.kind : 'failed';
  say(bar, problemWords(kind, setup.provider));
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
    bar.rewritten = true;
    const button = { id: 'undo' as const, label: text.bar.undo };
    update(bar, { suggestions: [], notice: { text: text.bar.done[style], button } });
  }
}

/** What a rewrite works on: the draft, and the chat it answers. */
interface DraftInChat {
  readonly draft: string;
  readonly chat: string;
  readonly read: ReadChat;
}

/** How many of the open chat's latest messages the user lets the assistant read. */
const messagesToRead = (bar: BarContext): number => Number(assistantSettings(bar).messages);

/** The draft to rewrite in the open chat, if there is one and the assistant may work there. */
async function draftToRewrite(bar: BarContext): Promise<DraftInChat | undefined> {
  const chat = await bar.deps.accounts.readActiveChat(messagesToRead(bar));
  if (chat === null) {
    return undefined;
  }
  if (!mayRead(bar, chat.name)) {
    update(bar, {
      notice: { text: text.status.notAllowed, button: { id: 'fix', label: text.bar.openSettings } },
    });
    return undefined;
  }
  const draft = await bar.deps.accounts.readDraft();
  return draft === null || draft.trim() === '' ? undefined : { draft, chat: chat.name, read: chat };
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
    answer = await bar.deps.core.ask(
      setup,
      rewritePrompt(style, found.draft, found.read, bar.deps.now()),
    );
  } catch (error) {
    update(bar, { working: false });
    failed(bar, setup, error);
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
function forget(bar: BarContext, writing: boolean): void {
  bar.suggesting?.abort();
  bar.suggesting = undefined;
  bar.chat = null;
  bar.kept = '';
  bar.blocked = false;
  bar.rewritten = false;
  bar.unsuggested = false;
  // Suggestions about to be made for the chat that opened keep the blank chips up meanwhile (#741).
  update(bar, { suggestions: [], notice: null, writing: writing && bar.state.writing });
}

/** Puts back the draft a rewrite replaced, while its chat is still open. */
async function undo(bar: BarContext): Promise<void> {
  const open = await bar.deps.accounts.readActiveChat(1);
  if (open !== null && open.name === bar.chat) {
    await bar.deps.accounts.replaceDraft(bar.kept);
  }
  update(bar, { notice: null });
}

const BUTTONS: Readonly<Record<BarButtonId, (bar: BarContext) => unknown>> = {
  undo,
  // It starts asking again, and says so; the answer comes as suggestions or a new reason.
  retry: (bar) => {
    void suggest(bar, bar.retryFor);
  },
  // Every fix the notice offers is in Settings.
  fix: (bar) => {
    bar.deps.openSettings();
  },
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

/**
 * Puts the suggestion at `index` in the message box, if its chat is still
 * open; it never sends it. The suggestions stay, so the user can pick
 * another (#743), and a draft the user had typed comes back on Undo, as
 * after a rewrite.
 */
async function use(bar: BarContext, index: number): Promise<void> {
  const suggestion = bar.state.suggestions[index];
  const open = suggestion === undefined ? null : await bar.deps.accounts.readActiveChat(1);
  if (open?.name !== bar.chat) {
    return;
  }
  const draft = (await bar.deps.accounts.readDraft().catch(() => null)) ?? '';
  await bar.deps.accounts.replaceDraft(String(suggestion));
  if (draft.trim() !== '' && draft !== suggestion) {
    bar.kept = draft;
    bar.rewritten = true;
    update(bar, {
      notice: { text: text.bar.replaced, button: { id: 'undo', label: text.bar.undo } },
    });
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

/**
 * Names the chat the bar now follows by the fingerprint the look gave its
 * header, the part of `message` before its colon, so the page shows the
 * suggestions only while that chat is open and reads it the same way the
 * look does (#741); null while none is open.
 */
function followed(bar: BarContext, message: string | null): void {
  const chat = message === null ? null : message.replace(/:.*/s, '');
  if (chat !== bar.state.chat) {
    update(bar, { chat });
  }
}

/** Whether suggestions can be made for the open chat: the setup is ready and the user lets it be read. */
async function readyToSuggest(bar: BarContext): Promise<boolean> {
  const setup = await bar.deps.core.setup();
  return setup.missing === '' && (await chatToAnswer(bar)) !== undefined;
}

/** The open chat, if the user wants suggestions there, whoever sent its last item (#723). */
async function chatToAnswer(bar: BarContext): Promise<ReadChat | undefined> {
  const chat = await bar.deps.accounts.readActiveChat(messagesToRead(bar));
  return chat !== null && mayRead(bar, chat.name) ? chat : undefined;
}

const isAborted = (signal: AbortSignal): boolean => signal.aborted;

/** Asks for suggestions for the open chat; nothing shows if it fails or it went stale. */
async function makeSuggestions(bar: BarContext, message: string, signal: AbortSignal) {
  const setup = await bar.deps.core.setup();
  const chat = setup.missing === '' ? await chatToAnswer(bar) : undefined;
  if (chat === undefined || signal.aborted) {
    return;
  }
  bar.chat = chat.name;
  update(bar, { writing: true });
  const answer = await bar.deps.core
    .ask(setup, suggestPrompt(chat, bar.deps.now()), signal)
    .catch((error: unknown) => error);
  // A newer message or another chat may have called the request off while the model answered.
  if (isAborted(signal)) {
    return;
  }
  if (typeof answer !== 'string') {
    unsuggested(bar, message, setup, answer);
    return;
  }
  const suggestions = suggestionsIn(answer).map((item) => item.slice(0, MAX_SUGGESTION));
  if (suggestions.length === 0) {
    unsuggested(bar, message, setup, undefined);
    return;
  }
  remember(bar, message, suggestions);
  update(bar, { suggestions });
}

/** Why no suggestions came last time goes as soon as they are asked for again. */
function forgetReason(bar: BarContext): void {
  if (bar.unsuggested) {
    bar.unsuggested = false;
    update(bar, { notice: null });
  }
}

/**
 * Says why no suggestions came instead of showing nothing (#743): the
 * model declined the chat, which asking again will not change; a problem a
 * setting mends, with the way there; or nothing usable, or a passing
 * problem, with Try Again. `error` is undefined when the model answered
 * nothing usable.
 */
function unsuggested(bar: BarContext, message: string, setup: Setup, error: unknown): void {
  bar.unsuggested = true;
  bar.retryFor = message;
  const retry = { id: 'retry' as const, label: text.bar.retry };
  if (error === undefined) {
    update(bar, { notice: { text: text.bar.noSuggestions, button: retry } });
    return;
  }
  const kind = error instanceof ProviderError ? error.kind : 'failed';
  if (kind === 'refused') {
    update(bar, { notice: { text: text.bar.declined, button: null } });
    return;
  }
  const words = problemWords(kind, setup.provider);
  const fix = words.fix === undefined ? retry : { id: 'fix' as const, label: words.fix.label };
  update(bar, { notice: { text: words.status, button: fix } });
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
 * Suggests what to send after `message`, the open chat's last item,
 * whoever sent it. Suggestions already made for it show again. They are
 * made while the user has folded them away too, so showing them again
 * needs no wait (#729).
 */
async function suggest(bar: BarContext, message: string): Promise<void> {
  bar.suggesting?.abort();
  forgetReason(bar);
  const known = assistantSettings(bar).autoSuggest ? bar.made.get(message) : [];
  if (known !== undefined) {
    update(bar, { suggestions: known, writing: false });
    return;
  }
  const controller = new AbortController();
  bar.suggesting = controller;
  // The blank chips show from the start, so suggestions that start over show no gap (#741).
  const ready = await readyToSuggest(bar);
  if (controller.signal.aborted) {
    return;
  }
  update(bar, { suggestions: [], writing: ready });
  if (ready && (await settled(bar, controller.signal))) {
    // A page between loads can fail to be read; the next message asks again.
    await makeSuggestions(bar, message, controller.signal).catch(() => undefined);
  }
  // A newer request, a send or another chat says for itself whether one is being written.
  if (bar.suggesting === controller) {
    update(bar, { writing: false });
  }
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
  /** Folds the suggestions away until the user shows them again; they keep being made (#729). */
  readonly collapse: () => void;
  readonly expand: () => void;
  readonly button: (id: BarButtonId) => Promise<void>;
  /** The open chat was first seen, with `message` its last item, or no chat is open. */
  readonly found: (message: string | null) => void;
  /** Another chat is open, with `message` its last item, or none is. */
  readonly opened: (message: string | null) => void;
  /** Another item is the open chat's last: someone else's, or the user's own. */
  readonly arrived: (message: string) => void;
  /** The user sent a message in the open chat. */
  readonly sent: () => void;
  /** The user emptied the open chat's message box without sending. */
  readonly cleared: () => void;
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

/**
 * The message box is empty. Once after a rewrite filled it, a rewrite's
 * Undo has nothing left to put back over, and the suggestions for the
 * newest message come back, as they do when the user clears what they
 * typed (#629).
 */
function cleared(bar: BarContext, message: string | null): void {
  if (!bar.rewritten) {
    return;
  }
  bar.rewritten = false;
  if (bar.state.notice?.button?.id === 'undo') {
    bar.kept = '';
    update(bar, { notice: null });
  }
  if (message !== null) {
    void suggest(bar, message);
  }
}

/** What the assistant does as the open chat changes. */
function followChat(
  bar: BarContext,
): Pick<AssistantBar, 'found' | 'opened' | 'arrived' | 'sent' | 'cleared'> {
  // The open chat's last item, whoever sent it.
  let message: string | null = null;
  const follow = (newest: string | null): void => {
    message = newest;
    followed(bar, newest);
    if (newest !== null) {
      void suggest(bar, newest);
    }
  };
  return {
    found: (newest) => {
      follow(newest);
      void keepNotice(bar);
    },
    opened: (newest) => {
      forget(bar, newest !== null);
      follow(newest);
    },
    arrived: (newest) => {
      message = newest;
      followed(bar, newest);
      void suggest(bar, newest);
    },
    sent: () => {
      message = null;
      bar.rewritten = false;
      bar.unsuggested = false;
      bar.suggesting?.abort();
      update(bar, { suggestions: [], notice: null, writing: false });
    },
    cleared: () => {
      cleared(bar, message);
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
    blocked: false,
    busy: false,
    rewritten: false,
    suggesting: undefined,
    made: new Map(),
    retryFor: '',
    unsuggested: false,
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
    collapse: () => {
      update(bar, { collapsed: true });
    },
    expand: () => {
      update(bar, { collapsed: false });
    },
    ...followChat(bar),
  };
}
