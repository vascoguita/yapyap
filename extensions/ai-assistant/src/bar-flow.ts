import type {
  ActiveChat,
  AssistantOffer,
  AssistantRequest,
  ExtensionHost,
} from '@yapyap/extension-sdk';
import { reasonOf } from './assistant.ts';
import { isAllowed, setAllowed } from './chats.ts';
import { problemText } from './panel.ts';
import {
  COMPOSE_INSTRUCTIONS,
  INSTRUCTIONS,
  requestFor,
  suggestionsIn,
  transcriptOf,
} from './replies.ts';
import { providerOf } from './reply-flow.ts';
import { cleanRewrite } from './rewrites.ts';
import { assistantSettings, providerFor } from './settings.ts';

export type BarHost = Pick<
  ExtensionHost,
  'settings' | 'secrets' | 'chat' | 'storage' | 'assistant'
>;

/** A request the bar makes of the model: suggestions, or the message the user described. */
type Ask = Exclude<AssistantRequest, { type: 'confirm' }>;

const CONSENT =
  'To help here, the assistant sends this chat’s latest messages to your AI provider. Allow it in this chat?';
const ALLOW = 'Allow here';
const SETUP = 'Set up the assistant in its panel first: Extensions → AI assistant.';
const NOTHING = 'The model had nothing to suggest. Try again.';
const MOVED = 'You opened another chat. Ask again here.';

/** The bar's own limit on each suggestion (ADR 0013). */
const MAX_SUGGESTION = 1000;

const offering = (status: string, extra: Partial<AssistantOffer> = {}): AssistantOffer => ({
  suggestions: [],
  status,
  ...extra,
});

/** What the model wrote, as the suggestions the bar shows. */
function suggestionsFor(ask: Ask, reply: string): string[] {
  const found = ask.type === 'suggest' ? suggestionsIn(reply) : [cleanRewrite(reply)];
  return found.filter((text) => text !== '').map((text) => text.slice(0, MAX_SUGGESTION));
}

/**
 * Answers one request about the open chat. Nothing about a chat leaves
 * YapYap until the user allows the assistant there (#107), which the bar
 * asks with its confirm button.
 */
async function answer(
  host: BarHost,
  ask: Ask,
  chat: ActiveChat | null,
  make: typeof providerFor,
): Promise<AssistantOffer> {
  if (chat === null) {
    return offering(problemText('no-chat'));
  }
  if (!(await isAllowed(host.storage, chat.name))) {
    return offering(CONSENT, { confirm: ALLOW });
  }
  const provider = await providerOf(host, make);
  if (provider === undefined) {
    return offering(SETUP);
  }
  const transcript = transcriptOf(chat, assistantSettings(await host.settings.get()).context);
  const request =
    ask.type === 'suggest'
      ? requestFor(INSTRUCTIONS, transcript)
      : requestFor(COMPOSE_INSTRUCTIONS, `${transcript}\n\nWhat I want to say: ${ask.text}`);
  const completion = await provider.complete(request, () => undefined);
  const suggestions = suggestionsFor(ask, completion.text);
  return suggestions.length === 0 ? offering(NOTHING) : { suggestions, status: '' };
}

/** The request waiting for the user's consent, and the chat it was made in. */
interface Pending {
  ask?: Ask;
  chat: string | undefined;
}

/**
 * A new request, or the user's consent to the last one, which allows only
 * the chat that request was made in, and only while it is still open.
 */
async function handle(
  host: BarHost,
  pending: Pending,
  request: AssistantRequest,
  make: typeof providerFor,
): Promise<AssistantOffer> {
  const chat = await host.chat.readActive();
  if (request.type !== 'confirm') {
    pending.ask = request;
    pending.chat = chat?.name;
    return answer(host, request, chat, make);
  }
  if (pending.ask === undefined || chat === null || chat.name !== pending.chat) {
    return offering(MOVED);
  }
  await setAllowed(host.storage, chat.name, true);
  return answer(host, pending.ask, chat, make);
}

/**
 * Fills YapYap's assistant bar beneath the chat (ADR 0013): suggested
 * replies, or the message the user described, for the user to put in the
 * message box or send with a click. Requests run one at a time, in order.
 */
export function serveBar(host: BarHost, make: typeof providerFor = providerFor): void {
  const pending: Pending = { chat: undefined };
  let queue: Promise<unknown> = Promise.resolve();
  host.assistant.onRequest((request) => {
    queue = queue
      .then(() => handle(host, pending, request, make))
      .catch((error: unknown) => offering(problemText(reasonOf(error))))
      .then((offer) => host.assistant.offer(offer))
      // YapYap refuses an offer once the user takes the bar's grant back; nothing is left to tell.
      .catch(() => undefined);
  });
}
