import type {
  ActiveChat,
  AssistantChoice,
  AssistantOffer,
  AssistantRequest,
  ExtensionHost,
} from '@yapyap/extension-sdk';
import { reasonOf } from './assistant.ts';
import { isAllowed, setAllowed } from './chats.ts';
import { AUTO, currentSetup, MODEL_KEY, pageModels, type modelsOf, type Setup } from './models.ts';
import { problemText } from './panel.ts';
import {
  COMPOSE_INSTRUCTIONS,
  INSTRUCTIONS,
  requestFor,
  suggestionsIn,
  transcriptOf,
} from './replies.ts';
import { cleanRewrite } from './rewrites.ts';
import { missingSetting, providerFor } from './settings.ts';

export type BarHost = Pick<
  ExtensionHost,
  'settings' | 'secrets' | 'chat' | 'storage' | 'assistant'
>;

/** A request the bar makes of the model: suggestions, or the message the user described. */
type Ask = Extract<AssistantRequest, { type: 'suggest' | 'prompt' }>;

const CONSENT =
  'To help here, the assistant sends this chat’s latest messages to your AI provider. Allow it in this chat?';
const ALLOW = 'Allow here';
const SETUP = 'Set up the assistant in its panel first: Extensions → AI assistant.';
const NOTHING = 'The model had nothing to suggest. Try again.';
const MOVED = 'You opened another chat. Ask again here.';

/** The bar's own limit on each suggestion (ADR 0013). */
const MAX_SUGGESTION = 1000;

/** The bar's limits on a choice's values and labels. */
const MAX_VALUE = 100;
const MAX_LABEL = 60;

/**
 * The models the user can switch to in the bar (#467): Auto, which names
 * the model it picks, then every model the provider lists. Before the
 * assistant is set up, no provider is asked, and there is nothing to pick.
 */
function modelChoice({ picked, models, auto }: Setup): AssistantChoice {
  const listed = models.filter(({ id }) => id.length <= MAX_VALUE);
  const automatic = auto === undefined ? 'Auto' : `Auto (${auto.label})`;
  return {
    label: 'Model',
    current: listed.some(({ id }) => id === picked) ? picked : AUTO,
    options:
      listed.length === 0
        ? []
        : [
            { value: AUTO, label: automatic.slice(0, MAX_LABEL) },
            ...listed.map(({ id, label }) => ({ value: id, label: label.slice(0, MAX_LABEL) })),
          ],
  };
}

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
  setup: Setup,
  make: typeof providerFor,
): Promise<AssistantOffer> {
  if (chat === null) {
    return offering(problemText('no-chat'));
  }
  if (!(await isAllowed(host.storage, chat.name))) {
    return offering(CONSENT, { confirm: ALLOW });
  }
  const { settings, key } = setup;
  if (missingSetting(settings, key) !== '') {
    return offering(SETUP);
  }
  const provider = make(settings, key);
  const transcript = transcriptOf(chat, settings.context);
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
  request: Exclude<AssistantRequest, { type: 'choose' }>,
  setup: Setup,
  make: typeof providerFor,
): Promise<AssistantOffer> {
  const chat = await host.chat.readActive();
  if (request.type !== 'confirm') {
    pending.ask = request;
    pending.chat = chat?.name;
    return answer(host, request, chat, setup, make);
  }
  if (pending.ask === undefined || chat === null || chat.name !== pending.chat) {
    return offering(MOVED);
  }
  await setAllowed(host.storage, chat.name, true);
  return answer(host, pending.ask, chat, setup, make);
}

/**
 * Fills YapYap's assistant bar above the message box (ADR 0013): suggested
 * replies, or the message the user described, for the user to put in the
 * message box or send with a click. Requests run one at a time, in order.
 */
export function serveBar(
  host: BarHost,
  make: typeof providerFor = providerFor,
  list: typeof modelsOf = pageModels,
): void {
  const pending: Pending = { chat: undefined };
  // Each offer reads the setup once, for the answer and for the model choice
  // it names, since every call to YapYap counts against the extension's rate.
  const offer = async (request?: Exclude<AssistantRequest, { type: 'choose' }>): Promise<void> => {
    try {
      const setup = await currentSetup(host, list);
      const made =
        request === undefined
          ? offering('')
          : await handle(host, pending, request, setup, make).catch((error: unknown) =>
              offering(problemText(reasonOf(error))),
            );
      await host.assistant.offer({ ...made, choice: modelChoice(setup) });
    } catch {
      // YapYap refuses an offer once the user takes the bar's grant back; nothing is left to tell.
    }
  };
  // The user's pick in the bar, which YapYap checked was one of the offered models.
  const keep = async (value: string): Promise<void> => {
    try {
      await host.storage.set(MODEL_KEY, value);
    } catch {
      // The next offer still names the model in use; nothing is left to tell.
    }
  };
  // The bar names the model before anyone asks for anything.
  let queue = offer();
  host.assistant.onRequest((request) => {
    queue = queue.then(() => (request.type === 'choose' ? keep(request.value) : offer(request)));
  });
}
