import type { ReadChat } from '../../adapter/active-chat.ts';
import type {
  AssistantBarState,
  BarButtonId,
  BarSummary,
  SummarySections,
} from '../../shared/api/assistant-bar-api.ts';
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
import { isEmptySummary, summaryIn, summaryPrompt } from './summaries.ts';

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
  /**
   * The notice says why no suggestions or no summary came, which goes as
   * soon as suggestions are asked for again.
   */
  unsuggested: boolean;
  /** The summary being written, called off when another chat opens or the user sends (#705). */
  summarizing: AbortController | undefined;
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
  summary: null,
};

const NO_SECTIONS: SummarySections = { forYou: [], decisions: [], rest: [] };

/**
 * What the page shows of `state`, as the row shows one thing at a time:
 * while a notice offers Undo, it alone; the suggestions, kept meanwhile,
 * come back once the draft is put back, the box empties or the notice
 * closes (#743). The summary has its own box at the top of the chat, so it
 * stays (#705).
 */
const shownOf = (state: AssistantBarState): AssistantBarState =>
  state.notice?.button?.id === 'undo' ? { ...state, suggestions: [], writing: false } : state;

function update(bar: BarContext, next: Partial<AssistantBarState>): void {
  bar.state = { ...bar.state, ...next };
  bar.deps.publish(shownOf(bar.state));
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
    update(bar, { notice: { text: text.bar.done[style], button } });
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
  bar.summarizing?.abort();
  bar.summarizing = undefined;
  bar.chat = null;
  bar.kept = '';
  bar.blocked = false;
  bar.rewritten = false;
  bar.unsuggested = false;
  // Suggestions about to be made for the chat that opened keep the blank chips up meanwhile (#741).
  update(bar, {
    suggestions: [],
    notice: null,
    writing: writing && bar.state.writing,
    summary: null,
  });
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
 * another (#743), unless it replaced a draft the user had typed: then
 * Undo shows in their place, as after a rewrite, until the draft comes
 * back or the box empties.
 */
async function use(bar: BarContext, index: number): Promise<void> {
  const suggestion = shownOf(bar.state).suggestions[index];
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

/**
 * Shows suggestions made before for the chat open again, naming that chat
 * as the one they are for: picking one checks it is still open, and it
 * named the chat suggestions were last written in, or none after a switch,
 * so a pick did nothing (#743).
 */
async function showKnown(bar: BarContext, known: readonly string[], signal: AbortSignal) {
  const open =
    known.length === 0 ? null : await bar.deps.accounts.readActiveChat(1).catch(() => null);
  if (signal.aborted) {
    return;
  }
  bar.chat = open?.name ?? null;
  update(bar, { suggestions: known, writing: false });
}

/** Why no suggestions came last time goes as soon as they are asked for again. */
function forgetReason(bar: BarContext): void {
  if (bar.unsuggested) {
    bar.unsuggested = false;
    update(bar, { notice: null });
  }
}

/**
 * Says why the model wrote nothing to show instead of showing nothing
 * (#743): the model declined the chat, which asking again will not change;
 * a problem a setting mends, with the way there; or nothing usable, or a
 * passing problem, with Try Again. `error` is undefined when the model
 * answered nothing usable.
 */
function noAnswer(bar: BarContext, setup: Setup, error: unknown): void {
  bar.unsuggested = true;
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
  const problem = problemWords(kind, setup.provider);
  const fix = problem.fix === undefined ? retry : { id: 'fix' as const, label: problem.fix.label };
  update(bar, { notice: { text: problem.status, button: fix } });
}

/** Says why no suggestions came for `message`, which Try Again asks about again. */
function unsuggested(bar: BarContext, message: string, setup: Setup, error: unknown): void {
  bar.retryFor = message;
  noAnswer(bar, setup, error);
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
 * whoever sent it, or in reply to the message the user chose, which
 * `message` names too (#740). Suggestions already made for it show again,
 * so removing the quote brings back the last item's without asking. They are
 * made while the user has folded them away too, so showing them again
 * needs no wait (#729).
 */
async function suggest(bar: BarContext, message: string): Promise<void> {
  bar.suggesting?.abort();
  forgetReason(bar);
  const known = assistantSettings(bar).autoSuggest ? bar.made.get(message) : [];
  const controller = new AbortController();
  bar.suggesting = controller;
  if (known !== undefined) {
    await showKnown(bar, known, controller.signal);
    return;
  }
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

/** The summary of `count` unread messages at `stage`, with what it says once it shows, or why it does not. */
const summaryAt = (
  stage: BarSummary['stage'],
  count: number,
  { sections = NO_SECTIONS, covered = 0, problem = null }: Partial<BarSummary> = {},
): BarSummary => ({ stage, count, sections, covered, problem });

/** Takes the summary away, and calls off one being written. */
function dropSummary(bar: BarContext): void {
  bar.summarizing?.abort();
  bar.summarizing = undefined;
  if (bar.state.summary !== null) {
    update(bar, { summary: null });
  }
}

/** What a summary is made from: the setup, the open chat as the history limit reads it, and the unread count. */
interface SummaryWork {
  readonly setup: Setup;
  readonly chat: ReadChat;
  readonly count: number;
}

/**
 * Says in the summary's box why no summary came (#705): the model declined
 * the chat, or the messages gave it nothing to summarize, which asking
 * again will not change; or a problem with the provider, with Try Again.
 * `error` is undefined when the model answered nothing usable.
 */
function unsummarized(bar: BarContext, { setup, count }: SummaryWork, error: unknown): void {
  const kind = error instanceof ProviderError ? error.kind : 'failed';
  const problem =
    error === undefined || kind === 'refused'
      ? {
          text: error === undefined ? text.bar.nothingToSummarize : text.bar.summaryDeclined,
          retry: false,
        }
      : { text: problemWords(kind, setup.provider).status, retry: true };
  update(bar, { summary: summaryAt('failed', count, { problem }) });
}

/**
 * Asks the model for the summary and shows it, unless another chat opened
 * or the user sent meanwhile. Unread messages with no text, such as only
 * photos, give it nothing to summarize, so nothing is asked.
 */
async function answerSummary(bar: BarContext, work: SummaryWork, signal: AbortSignal) {
  const { setup, chat, count } = work;
  const read = chat.messages.length;
  if (chat.messages.slice(-count).every((message) => message.text.trim() === '')) {
    unsummarized(bar, work, undefined);
    return;
  }
  const answer = await bar.deps.core
    .ask(setup, summaryPrompt(chat, count, bar.deps.now()), signal)
    .catch((error: unknown) => error);
  if (isAborted(signal)) {
    return;
  }
  const sections = typeof answer === 'string' ? summaryIn(answer) : NO_SECTIONS;
  if (isEmptySummary(sections)) {
    unsummarized(bar, work, typeof answer === 'string' ? undefined : answer);
    return;
  }
  const covered = count > read ? read : 0;
  update(bar, { summary: summaryAt('shown', count, { sections, covered }) });
}

/**
 * Writes the summary of the `count` unread messages, saying so in its box
 * meanwhile (#705). It reads the open chat as far as the history limit
 * allows, and keeps the summary only in memory.
 */
async function writeSummary(bar: BarContext, count: number): Promise<void> {
  bar.summarizing?.abort();
  const controller = new AbortController();
  bar.summarizing = controller;
  update(bar, { summary: summaryAt('working', count) });
  const setup = await ready(bar);
  const chat = setup === undefined ? undefined : await chatToAnswer(bar).catch(() => undefined);
  if (controller.signal.aborted) {
    return;
  }
  if (setup === undefined || chat === undefined) {
    update(bar, { summary: null });
    return;
  }
  await answerSummary(bar, { setup, chat, count }, controller.signal);
}

/**
 * Summarizes the `count` messages the chat that opened had unread, if any
 * (#705), with no click: only while the user wants unread messages
 * summarized, the setup is ready and the user lets the assistant read the
 * chat. Another chat opening meanwhile calls it off.
 */
async function summarizeOnOpening(bar: BarContext, count: number): Promise<void> {
  if (count === 0 || !assistantSettings(bar).summaries) {
    return;
  }
  const controller = new AbortController();
  bar.summarizing = controller;
  const setup = await bar.deps.core.setup();
  const chat = setup.missing === '' ? await bar.deps.accounts.readActiveChat(1) : null;
  if (chat !== null && mayRead(bar, chat.name) && !controller.signal.aborted) {
    await writeSummary(bar, count);
  }
}

/** The box's Try Again: the summary that failed, written again. */
async function summarizeAgain(bar: BarContext): Promise<void> {
  const failed = bar.state.summary;
  if (failed?.stage === 'failed' && failed.problem?.retry === true) {
    await writeSummary(bar, failed.count);
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
  /**
   * The open chat was first seen, with `message` its last item, or no chat
   * is open; it opened with `unread` messages unread, or 0 for too few to
   * summarize (#705).
   */
  readonly found: (message: string | null, unread: number) => void;
  /** Another chat is open, with `message` its last item and `unread` as for `found`, or none is. */
  readonly opened: (message: string | null, unread: number) => void;
  /** Another item is the open chat's last, someone else's or the user's own, or the user replies to another message (#740). */
  readonly arrived: (message: string) => void;
  /** The user sent a message in the open chat. */
  readonly sent: () => void;
  /** The user emptied the open chat's message box without sending. */
  readonly cleared: () => void;
  /** Writes the summary again, after one that failed (#705). */
  readonly summarize: () => Promise<void>;
  /** Takes the summary away. */
  readonly closeSummary: () => void;
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
 * newest message show, as they do when the user clears what they typed
 * (#629); they were kept behind the Undo, so they show as they were.
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
  const last: LastItem = { message: null };
  const follow = (newest: string | null): void => {
    last.message = newest;
    followed(bar, newest);
    if (newest !== null) {
      void suggest(bar, newest);
    }
  };
  return {
    ...sendAndClear(bar, last),
    found: (newest, unread) => {
      follow(newest);
      void keepNotice(bar);
      summarizeUnread(bar, unread);
    },
    opened: (newest, unread) => {
      forget(bar, newest !== null);
      follow(newest);
      summarizeUnread(bar, unread);
    },
    // The summary stays as messages arrive: WhatsApp draws a chat with many
    // unread a row at a time, and each row looks like a new last message.
    arrived: (newest) => {
      last.message = newest;
      followed(bar, newest);
      void suggest(bar, newest);
    },
  };
}

/** The open chat's last item, whoever sent it, as the follow loop names it; null for none. */
interface LastItem {
  message: string | null;
}

/** Summarizes a chat opened with many unread messages; a page between loads can fail to be read. */
function summarizeUnread(bar: BarContext, unread: number): void {
  summarizeOnOpening(bar, unread).catch(() => undefined);
}

/**
 * What the assistant does when the user sends, which takes away all it
 * showed about the chat, a summary too, and when they empty the message box.
 */
function sendAndClear(bar: BarContext, last: LastItem): Pick<AssistantBar, 'sent' | 'cleared'> {
  return {
    sent: () => {
      last.message = null;
      bar.rewritten = false;
      bar.unsuggested = false;
      bar.suggesting?.abort();
      bar.summarizing?.abort();
      update(bar, { suggestions: [], notice: null, writing: false, summary: null });
    },
    cleared: () => {
      cleared(bar, last.message);
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
    summarizing: undefined,
  };
  return {
    state: () => shownOf(bar.state),
    refresh: async () => {
      deps.show(deps.settings.current().assistant.enabled);
      await refresh(bar);
    },
    polish: (value) => polish(bar, value),
    use: (index) => use(bar, index),
    button: (id) => press(bar, id),
    summarize: () => summarizeAgain(bar),
    closeSummary: () => {
      dropSummary(bar);
    },
    collapse: () => {
      update(bar, { collapsed: true });
    },
    expand: () => {
      update(bar, { collapsed: false });
    },
    ...followChat(bar),
  };
}
