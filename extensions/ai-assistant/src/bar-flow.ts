import type {
  ActiveChat,
  AssistantChoice,
  AssistantOffer,
  AssistantRequest,
  ExtensionHost,
} from '@yapyap/extension-sdk';
import { reasonOf } from './assistant.ts';
import type { LocalModel, LocalState } from './built-in/local-model.ts';
import { offerOf, wordsFor, type LocalAction, type LocalWords } from './built-in/words.ts';
import { isAllowed, setAllowed } from './chats.ts';
import { AUTO, currentSetup, MODEL_KEY, pageModels, type modelsOf, type Setup } from './models.ts';
import { findModel, type SearchOutcome } from './find-model.ts';
import { problemText, SEARCH, SEARCH_OFFER } from './panel.ts';
import {
  COMPOSE_INSTRUCTIONS,
  INSTRUCTIONS,
  requestFor,
  suggestionsIn,
  transcriptOf,
} from './replies.ts';
import { ProviderError } from './providers/provider.ts';
import { cleanRewrite } from './rewrites.ts';
import { missingSetting, offersSearch, providerFor } from './settings.ts';

export type BarHost = Pick<
  ExtensionHost,
  'settings' | 'secrets' | 'chat' | 'storage' | 'assistant' | 'localModels'
>;

/** A request the bar makes of the model: suggestions, or the message the user described. */
type Ask = Extract<AssistantRequest, { type: 'suggest' | 'prompt' }>;

const CONSENT =
  'To help here, the assistant sends this chat’s latest messages to your AI provider. Allow it in this chat?';
/** The private model reads the chat in this page (#457), so nothing is sent anywhere. */
const CONSENT_HERE =
  'To help here, the assistant reads this chat’s latest messages, which stay on this computer. Allow it in this chat?';
const ALLOW = 'Allow here';
const SETUP = 'Set up the assistant in its panel first: Extensions → AI assistant.';
const NOTHING = 'The model had nothing to suggest. Try again.';
const MOVED = 'You opened another chat. Ask again here.';
const FOUND = 'Found an AI model on this computer. Ask for suggestions: your messages stay on it.';

/**
 * How long to wait after YapYap said the extension calls too often, and how
 * often to try in all: its rate refills five calls a second.
 */
const RATE_RETRY_MS = 1000;
const RATE_TRIES = 3;

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

/** What the bar's confirm button does: find a model, or download or swap the private one. */
type BarAction = 'search' | LocalAction;

/** What the bar shows, and what its confirm button does when not asking for consent. */
interface Offer {
  readonly offer: AssistantOffer;
  readonly action?: BarAction;
}

/** An offer, with the setup whose models its choice names; without one, the bar keeps its choice. */
interface Shown extends Offer {
  readonly setup?: Setup;
}

/** The offer to find a model on this computer (#456), which the confirm button accepts. */
const SEARCHING: Offer = { offer: offering(SEARCH_OFFER, { confirm: SEARCH }), action: 'search' };

/** What the bar says about the private model (#457), with its button if there is one. */
function localOffer({ status, label, action }: LocalWords): Offer {
  return action === ''
    ? { offer: offering(status) }
    : { offer: offering(status, { confirm: label }), action };
}

/** Why the search found nothing, briefly: the bar offers the private model right after. */
const NOT_FOUND: Readonly<Record<Exclude<SearchOutcome, 'found'>, string>> = {
  'no-server': 'No AI model runs on this computer.',
  'no-models': 'The model server on this computer has no model yet.',
  'search-refused': 'You did not let the assistant look on this computer.',
  'search-unsupported': 'This YapYap cannot look for a model on this computer.',
  'search-failed': 'Looking for a model on this computer failed.',
};

/** What the bar says is missing: a server on this computer that stopped answering, or the setup. */
const setupText = (missing: string): string =>
  missing === 'local-server' ? problemText(missing) : SETUP;

/** What the model wrote, as the suggestions the bar shows. */
function suggestionsFor(ask: Ask, reply: string): string[] {
  const found = ask.type === 'suggest' ? suggestionsIn(reply) : [cleanRewrite(reply)];
  return found.filter((text) => text !== '').map((text) => text.slice(0, MAX_SUGGESTION));
}

/** What answering needs: the setup, the provider maker, and the private model. */
interface Context {
  readonly setup: Setup;
  readonly make: typeof providerFor;
  readonly local: LocalModel;
}

/** What the model answers to `ask` about `chat`, as the bar shows it. */
async function asked(ask: Ask, chat: ActiveChat, { setup, make, local }: Context): Promise<Offer> {
  const { settings, key } = setup;
  const provider = make(settings, key, local);
  const transcript = transcriptOf(chat, settings.context);
  const request =
    ask.type === 'suggest'
      ? requestFor(INSTRUCTIONS, transcript)
      : requestFor(COMPOSE_INSTRUCTIONS, `${transcript}\n\nWhat I want to say: ${ask.text}`);
  const completion = await provider.complete(request, () => undefined);
  const suggestions = suggestionsFor(ask, completion.text);
  return { offer: suggestions.length === 0 ? offering(NOTHING) : { suggestions, status: '' } };
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
  context: Context,
): Promise<Offer> {
  const { settings, key } = context.setup;
  // Someone who set nothing up is offered the model on this computer before anything else.
  if (offersSearch(settings, key)) {
    return SEARCHING;
  }
  const missing = missingSetting(settings, key);
  // The private model says how its download stands, and offers what to do next.
  if (missing === 'download') {
    return localOffer(wordsFor(await context.local.state(), true));
  }
  if (chat === null) {
    return { offer: offering(problemText('no-chat')) };
  }
  if (!(await isAllowed(host.storage, chat.name))) {
    const consent = settings.provider === 'built-in' ? CONSENT_HERE : CONSENT;
    return { offer: offering(consent, { confirm: ALLOW }) };
  }
  return missing === '' ? asked(ask, chat, context) : { offer: offering(setupText(missing)) };
}

/**
 * The request waiting for the user's consent, and the chat it was made in;
 * or, with an `action`, what the confirm button offers instead.
 */
interface Pending {
  ask?: Ask;
  chat: string | undefined;
  action: BarAction | undefined;
}

type BarRequest = Exclude<AssistantRequest, { type: 'choose' }>;

/** How the bar reaches providers and the private model. */
interface Sources {
  readonly make: typeof providerFor;
  readonly list: typeof modelsOf;
  readonly local: LocalModel;
}

/** A failed request explained; a private model short of memory offers the smaller one. */
async function failureOffer(error: unknown, local: LocalModel): Promise<Offer> {
  const reason = reasonOf(error);
  // YapYap's own rate, unlike a provider's, passes once the bar waits a moment, so it is tried again.
  if (reason === 'rate-limited' && !(error instanceof ProviderError)) {
    throw error;
  }
  return reason === 'out-of-memory'
    ? localOffer(wordsFor(await local.state(), false))
    : { offer: offering(problemText(reason)) };
}

/**
 * Answers a request, or makes the first offer. Each reads the setup once,
 * for the answer and for the model choice it names, since every call to
 * YapYap counts against the extension's rate.
 */
async function answered(
  host: BarHost,
  pending: Pending,
  request: BarRequest | LocalWords | undefined,
  { make, list, local }: Sources,
): Promise<Shown> {
  const setup = await currentSetup(host, list);
  if (request === undefined) {
    const first = offersSearch(setup.settings, setup.key) ? SEARCHING : { offer: offering('') };
    return { setup, ...first };
  }
  // News of the private model, with the models the setup now lists.
  if ('status' in request) {
    return { setup, ...localOffer(request) };
  }
  const shown = await handle(host, pending, request, { setup, make, local }).catch(
    (error: unknown) => failureOffer(error, local),
  );
  return { setup, ...shown };
}

/**
 * Finds a model on this computer, on the user's click (#456), and names
 * what came of it, with the setup that now uses it. When none can be used,
 * the bar offers the private model instead (#457).
 */
async function searched(host: BarHost, { list, local }: Sources): Promise<Shown> {
  const outcome = await findModel(host).catch(() => 'search-failed' as const);
  const setup = await currentSetup(host, list);
  if (outcome !== 'found') {
    const { model } = await local.state();
    const offer = offerOf(model);
    return { setup, ...localOffer({ ...offer, status: `${NOT_FOUND[outcome]} ${offer.status}` }) };
  }
  const missing = missingSetting(setup.settings, setup.key);
  return { setup, offer: offering(missing === '' ? FOUND : setupText(missing)) };
}

/**
 * Downloads the private model, or the smaller one, on the user's click,
 * and says how it stands. The models to pick from change only once it is
 * ready, so the setup is not read meanwhile.
 */
async function fetching(action: LocalAction, local: LocalModel): Promise<Shown> {
  await (action === 'download' ? local.download() : local.smaller());
  return localOffer(wordsFor(await local.state(), true));
}

/**
 * A new request, or the user's consent to the last one, which allows only
 * the chat that request was made in, and only while it is still open.
 */
async function handle(
  host: BarHost,
  pending: Pending,
  request: BarRequest,
  context: Context,
): Promise<Offer> {
  const chat = await host.chat.readActive();
  if (request.type !== 'confirm') {
    pending.ask = request;
    pending.chat = chat?.name;
    return answer(host, request, chat, context);
  }
  if (pending.ask === undefined || chat === null || chat.name !== pending.chat) {
    return { offer: offering(MOVED) };
  }
  await setAllowed(host.storage, chat.name, true);
  return answer(host, pending.ask, chat, context);
}

/** What the user's click on the confirm button does, given what the bar last offered. */
function confirmed(host: BarHost, pending: Pending, sources: Sources): Promise<Shown> | undefined {
  const { action } = pending;
  if (action === undefined) {
    return undefined;
  }
  return action === 'search' ? searched(host, sources) : fetching(action, sources.local);
}

/**
 * Keeps the bar up to date with the private model (#457): the download's
 * progress, which outlives the request that started it, warming up, and the
 * model becoming ready or going. These show at once, not after the request
 * the user waits on; running out of memory comes with that request's answer.
 */
function followLocal(
  host: BarHost,
  local: LocalModel,
  pending: Pending,
  again: (news?: LocalWords) => void,
): void {
  let last: LocalState['phase']['kind'] = 'none';
  local.onChange((state) => {
    const { kind } = state.phase;
    const shows = !['ready', 'none', 'out-of-memory'].includes(kind);
    const finished = kind === 'ready' && last === 'downloading';
    const removed = kind === 'none' && last !== 'none';
    last = kind;
    // A model ready or gone changes what the bar lists to pick from.
    if (removed || finished) {
      again(finished ? wordsFor(state, false) : undefined);
      return;
    }
    if (shows) {
      const { offer, action } = localOffer(wordsFor(state, false));
      pending.action = action;
      host.assistant.offer(offer).catch(() => undefined);
    }
  });
}

/**
 * Runs `attempt`, and again a second later while YapYap says the extension
 * calls too often, up to `tries` times: a burst of clicks can run past its
 * rate, and the bar would otherwise wait on its answer for good.
 */
async function patiently(attempt: () => Promise<void>, tries: number): Promise<void> {
  try {
    await attempt();
  } catch (error) {
    if (tries <= 1 || reasonOf(error) !== 'rate-limited') {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RATE_RETRY_MS));
    await patiently(attempt, tries - 1);
  }
}

/** Answers `request`, or tells news of the private model, in the bar. */
async function offerOnce(
  host: BarHost,
  pending: Pending,
  sources: Sources,
  request: BarRequest | LocalWords | undefined,
): Promise<void> {
  // The confirm button does what the last offer proposed, if it proposed anything.
  const confirm = request !== undefined && 'type' in request && request.type === 'confirm';
  const shown =
    (confirm ? confirmed(host, pending, sources) : undefined) ??
    answered(host, pending, request, sources);
  const { offer, setup, action } = await shown;
  pending.action = action;
  const choice = setup === undefined ? {} : { choice: modelChoice(setup) };
  await host.assistant.offer({ ...offer, ...choice });
}

/**
 * Fills YapYap's assistant bar above the message box (ADR 0013): suggested
 * replies, or the message the user described, for the user to put in the
 * message box or send with a click. Requests run one at a time, in order.
 */
export function serveBar(
  host: BarHost,
  local: LocalModel,
  {
    make = providerFor,
    list = pageModels,
  }: { make?: typeof providerFor; list?: typeof modelsOf } = {},
): void {
  const sources: Sources = { make, list, local };
  const pending: Pending = { chat: undefined, action: undefined };
  const offer = async (request?: BarRequest | LocalWords): Promise<void> => {
    try {
      await patiently(() => offerOnce(host, pending, sources, request), RATE_TRIES);
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
  followLocal(host, local, pending, (news) => {
    queue = queue.then(() => offer(news));
  });
}
