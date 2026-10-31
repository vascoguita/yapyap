import type { ActiveChat, ExtensionHost } from '@yapyap/extension-sdk';
import type { Update } from './bus.ts';
import { isAllowed, setAllowed } from './chats.ts';
import type { Provider } from './providers/provider.ts';
import {
  INSTRUCTIONS,
  requestFor,
  suggestionsIn,
  SUMMARY_INSTRUCTIONS,
  transcriptOf,
} from './replies.ts';
import { cleanRewrite, rewriteInstructions, type RewriteStyle } from './rewrites.ts';
import { currentSetup, type modelsOf } from './models.ts';
import {
  assistantSettings,
  missingSetting,
  type BuiltInRunner,
  type providerFor,
} from './settings.ts';

export type FlowHost = Pick<
  ExtensionHost,
  'settings' | 'secrets' | 'chat' | 'composer' | 'storage'
>;

type Post = (update: Update) => void;

/** What the panel asked the assistant to do with the open chat. */
export type Plan =
  | { readonly mode: 'replies' }
  | { readonly mode: 'summary' }
  | { readonly mode: 'rewrite'; readonly style: RewriteStyle; readonly language: string };

/** One panel's work in progress: the plan, the chat it previewed, what it showed, what came back. */
interface Session {
  plan: Plan;
  chat?: string;
  instructions?: string;
  text?: string;
  suggestions: readonly string[];
  controller?: AbortController;
}

const problem = (reason: string): Update => ({ type: 'problem', reason });

/** The text the plan sends, and its instructions; or the reason there is none. */
async function material(
  host: FlowHost,
  plan: Plan,
  chat: ActiveChat,
): Promise<{ text: string; instructions: string } | string> {
  if (plan.mode !== 'rewrite') {
    const { context } = assistantSettings(await host.settings.get());
    const instructions = plan.mode === 'replies' ? INSTRUCTIONS : SUMMARY_INSTRUCTIONS;
    return { text: transcriptOf(chat, context), instructions };
  }
  const draft = await host.composer.readDraft();
  return draft === null || draft === ''
    ? 'empty-draft'
    : { text: draft, instructions: rewriteInstructions(plan.style, plan.language) };
}

const preview = (chat: string, allowed: boolean, instructions = '', text = ''): Update => ({
  type: 'preview',
  transcript: text,
  allowed,
  chat,
  instructions,
});

async function prepare(host: FlowHost, session: Session, post: Post): Promise<void> {
  delete session.text;
  session.suggestions = [];
  const chat = await host.chat.readActive();
  if (chat === null) {
    post(problem('no-chat'));
    return;
  }
  session.chat = chat.name;
  // Nothing about a chat leaves YapYap until the user allows the assistant there.
  if (!(await isAllowed(host.storage, chat.name))) {
    post(preview(chat.name, false));
    return;
  }
  const found = await material(host, session.plan, chat);
  if (typeof found === 'string') {
    post(problem(found));
    return;
  }
  session.text = found.text;
  session.instructions = found.instructions;
  post(preview(chat.name, true, found.instructions, found.text));
}

async function allow(host: FlowHost, session: Session, post: Post, allowed: boolean) {
  if (session.chat === undefined) {
    post(problem('no-chat'));
    return;
  }
  await setAllowed(host.storage, session.chat, allowed);
  await prepare(host, session, post);
}

/** Where the flow's answers come from: the providers, their lists, and the private model (#457). */
export interface FlowSources {
  readonly make: typeof providerFor;
  readonly list: typeof modelsOf;
  readonly local: BuiltInRunner;
}

/** The provider the settings and key make, or undefined while the setup is unfinished. */
async function providerOf(
  host: Pick<ExtensionHost, 'settings' | 'secrets' | 'storage'>,
  { make, list, local }: FlowSources,
): Promise<Provider | undefined> {
  const { settings, key } = await currentSetup(host, list);
  return missingSetting(settings, key) === '' ? make(settings, key, local) : undefined;
}

async function send(host: FlowHost, session: Session, post: Post, sources: FlowSources) {
  // Only what the panel showed is ever sent: the text kept here, never the panel's copy.
  const { text, instructions = '' } = session;
  const provider = await providerOf(host, sources);
  if (text === undefined || provider === undefined) {
    post(problem(text === undefined ? 'not-prepared' : 'setup'));
    return;
  }
  session.controller?.abort();
  const controller = new AbortController();
  session.controller = controller;
  const completion = await provider.complete(
    requestFor(instructions, text, controller.signal),
    (piece) => {
      post({ type: 'progress', text: piece });
    },
  );
  if (session.plan.mode === 'summary') {
    // A summary is for reading in the panel; nothing of it goes to the chat.
    session.suggestions = [];
    post({ type: 'summary', text: completion.text.trim() });
    return;
  }
  const replace = session.plan.mode === 'rewrite';
  session.suggestions = replace
    ? [cleanRewrite(completion.text)].filter((item) => item !== '')
    : suggestionsIn(completion.text);
  post({ replace, type: 'suggestions', items: session.suggestions });
}

async function use(host: FlowHost, session: Session, post: Post, index: number) {
  const suggestion = session.suggestions[index];
  if (suggestion === undefined) {
    post(problem('invalid'));
    return;
  }
  // A rewrite takes the draft's place; a suggested reply joins whatever is there.
  await (session.plan.mode === 'rewrite'
    ? host.composer.replaceDraft(suggestion)
    : host.composer.insertDraft(suggestion));
  post({ type: 'used' });
}

/** What the panel can ask of the reply flow. */
export interface ReplyFlow {
  /** Looks at the open chat for `plan`, previewing what would be sent. */
  readonly prepare: (plan: Plan) => Promise<void>;
  readonly allow: (allowed: boolean) => Promise<void>;
  readonly send: () => Promise<void>;
  readonly cancel: () => void;
  readonly use: (index: number) => Promise<void>;
}

/**
 * Suggested replies (#104) and rewritten drafts (#105), with consent (#107):
 * the panel previews exactly what would be sent for the open chat, the user
 * allows the assistant chat by chat, and only then sends. A chosen reply
 * becomes a draft and a rewrite replaces the draft; nothing is ever sent
 * to the chat.
 */
export function replyFlow(host: FlowHost, post: Post, sources: FlowSources): ReplyFlow {
  const session: Session = { plan: { mode: 'replies' }, suggestions: [] };
  return {
    prepare: (plan: Plan) => {
      session.plan = plan;
      return prepare(host, session, post);
    },
    allow: (allowed: boolean) => allow(host, session, post, allowed),
    send: () => send(host, session, post, sources),
    cancel: () => {
      session.controller?.abort();
    },
    use: (index: number) => use(host, session, post, index),
  };
}
