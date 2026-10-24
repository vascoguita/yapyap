import type { PluginHost } from '@yapyap/plugin-sdk';
import type { Update } from './bus.ts';
import { isAllowed, setAllowed } from './chats.ts';
import type { Provider } from './providers/provider.ts';
import { INSTRUCTIONS, replyRequest, suggestionsIn, transcriptOf } from './replies.ts';
import { assistantSettings, keyName, missingSetting, providerFor } from './settings.ts';

export type FlowHost = Pick<PluginHost, 'settings' | 'secrets' | 'chat' | 'composer' | 'storage'>;

type Post = (update: Update) => void;

/** One panel's work in progress: the chat it previewed, what it showed, what came back. */
interface Session {
  chat?: string;
  transcript?: string;
  suggestions: readonly string[];
  controller?: AbortController;
}

const problem = (reason: string): Update => ({ type: 'problem', reason });

async function prepare(host: FlowHost, session: Session, post: Post): Promise<void> {
  delete session.transcript;
  session.suggestions = [];
  const chat = await host.chat.readActive();
  if (chat === null) {
    post(problem('no-chat'));
    return;
  }
  session.chat = chat.name;
  // Nothing about a chat leaves YapYap until the user allows the assistant there.
  const allowed = await isAllowed(host.storage, chat.name);
  if (allowed) {
    const { context } = assistantSettings(await host.settings.get());
    session.transcript = transcriptOf(chat, context);
  }
  post({
    allowed,
    type: 'preview',
    chat: chat.name,
    instructions: allowed ? INSTRUCTIONS : '',
    transcript: session.transcript ?? '',
  });
}

async function allow(host: FlowHost, session: Session, post: Post, allowed: boolean) {
  if (session.chat === undefined) {
    post(problem('no-chat'));
    return;
  }
  await setAllowed(host.storage, session.chat, allowed);
  await prepare(host, session, post);
}

async function providerOf(host: FlowHost, make: typeof providerFor): Promise<Provider | undefined> {
  const settings = assistantSettings(await host.settings.get());
  const key = await host.secrets.get(keyName(settings.provider));
  if (key === undefined || missingSetting(settings, key) !== '') {
    return undefined;
  }
  return make(settings, key);
}

async function send(host: FlowHost, session: Session, post: Post, make: typeof providerFor) {
  // Only what the panel showed is ever sent: the transcript kept here, never the panel's copy.
  const { transcript } = session;
  const provider = await providerOf(host, make);
  if (transcript === undefined || provider === undefined) {
    post(problem(transcript === undefined ? 'not-prepared' : 'setup'));
    return;
  }
  session.controller?.abort();
  const controller = new AbortController();
  session.controller = controller;
  const completion = await provider.complete(
    replyRequest(transcript, controller.signal),
    (text) => {
      post({ type: 'progress', text });
    },
  );
  session.suggestions = suggestionsIn(completion.text);
  post({ type: 'suggestions', items: session.suggestions });
}

async function use(host: FlowHost, session: Session, post: Post, index: number) {
  const suggestion = session.suggestions[index];
  if (suggestion === undefined) {
    post(problem('invalid'));
    return;
  }
  await host.composer.insertDraft(suggestion);
  post({ type: 'used' });
}

/** What the panel can ask of the reply flow. */
export interface ReplyFlow {
  readonly prepare: () => Promise<void>;
  readonly allow: (allowed: boolean) => Promise<void>;
  readonly send: () => Promise<void>;
  readonly cancel: () => void;
  readonly use: (index: number) => Promise<void>;
}

/**
 * Suggested replies (#104), with consent (#107): the panel previews exactly
 * what would be sent for the open chat, the user allows the assistant chat
 * by chat, and only then sends. A chosen reply becomes a draft, never a
 * sent message.
 */
export function replyFlow(
  host: FlowHost,
  post: Post,
  make: typeof providerFor = providerFor,
): ReplyFlow {
  const session: Session = { suggestions: [] };
  return {
    prepare: () => prepare(host, session, post),
    allow: (allowed: boolean) => allow(host, session, post, allowed),
    send: () => send(host, session, post, make),
    cancel: () => {
      session.controller?.abort();
    },
    use: (index: number) => use(host, session, post, index),
  };
}
