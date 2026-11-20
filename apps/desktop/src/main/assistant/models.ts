import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { KeyedProvider } from '../../shared/api/chrome-api.ts';
import { kindOf } from './providers/errors.ts';
import { REQUEST_TIMEOUT_MS, type ProviderErrorKind } from './providers/provider.ts';

/** Who answers: a service YapYap knows, or a model server the user names (#627). */
export type ProviderId = 'anthropic' | 'openai' | 'server';

/** A model the user can switch to, under a name people can read. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

/** As many models as the bar and Settings list. */
export const MAX_MODELS = 20;

/** What a provider's list depends on. */
export interface ListTarget {
  readonly provider: ProviderId;
  /** The user's key; empty for a server that needs none. */
  readonly key: string;
  /** The model server's address, for `server`. */
  readonly endpoint: string;
}

/**
 * OpenAI lists every model it serves, most of which cannot chat: images,
 * speech, embeddings and moderation would only clutter the list.
 */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search/i;

/** Servers at home mostly take any key or none; the SDK still needs one to send. */
export const NO_KEY = 'no-key';

const common = (apiKey: string, fetch: typeof globalThis.fetch) => ({
  apiKey,
  fetch,
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: 1,
});

/** Claude's models, newest first, by the names Anthropic gives them. */
async function claudeModels(key: string, fetch: typeof globalThis.fetch): Promise<ModelOption[]> {
  const client = new Anthropic(common(key, fetch));
  const page = await client.models.list({ limit: MAX_MODELS });
  return page.data.map((model) => ({ id: model.id, label: model.display_name }));
}

/**
 * Ollama, Alpaca's server among them, reports each model's size, which the
 * OpenAI-style list leaves out; smaller models answer faster. Other servers
 * have no such list, so their own order stands. Only a server at home, on
 * plain http, is asked, so no cloud service gets a request it never offered.
 */
async function sizesOf(endpoint: string, fetch: typeof globalThis.fetch) {
  if (new URL(endpoint).protocol !== 'http:') {
    return new Map<string, number>();
  }
  try {
    const response = await fetch(`${new URL(endpoint).origin}/api/tags`);
    const body = (await response.json()) as { models?: { name?: unknown; size?: unknown }[] };
    return new Map(
      (body.models ?? []).flatMap(({ name, size }) =>
        typeof name === 'string' && typeof size === 'number' ? [[name, size] as const] : [],
      ),
    );
  } catch {
    return new Map<string, number>();
  }
}

const bySize =
  (sizes: ReadonlyMap<string, number>) =>
  (a: ModelOption, b: ModelOption): number =>
    (sizes.get(a.id) ?? Infinity) - (sizes.get(b.id) ?? Infinity);

/** What OpenAI or a model server lists, such as the models Ollama has installed. */
async function servedModels(
  target: ListTarget,
  fetch: typeof globalThis.fetch,
): Promise<ModelOption[]> {
  const server = target.provider === 'server';
  // The SDK refuses an empty key, which a server at home rarely needs.
  const client = new OpenAI({
    ...common(target.key || NO_KEY, fetch),
    ...(server ? { baseURL: target.endpoint } : {}),
  });
  const page = await client.models.list();
  // Newest first, as Anthropic lists Claude's, so the first fitting model is the newest.
  const options = [...page.data]
    .sort((a, b) => b.created - a.created)
    .map((model) => model.id)
    .filter((id) => server || !NOT_CHAT.test(id))
    .map((id) => ({ id, label: id }));
  return server ? options.sort(bySize(await sizesOf(target.endpoint, fetch))) : options;
}

/**
 * The tier of each provider's models that writes chat messages best
 * (#702): Claude's Sonnet, and OpenAI's flagship, named by its number
 * alone, without mini, nano, pro or another suffix, or with only a date.
 * The quick tiers wrote noticeably worse replies and rewrites, and Opus
 * and pro models cost and take more than a short message needs. Naming a
 * tier rather than a model keeps Auto on the newest one. A model server
 * has none: on home hardware, the smallest model answers in time.
 */
const BEST: Readonly<Record<ProviderId, RegExp | undefined>> = {
  anthropic: /sonnet/i,
  openai: /^gpt-\d+(?:\.\d+)?(?:-\d{4}-\d{2}-\d{2})?$/i,
  server: undefined,
};

/**
 * The model Auto uses (#467): the newest of the provider's best tier, the
 * newest model when there is no such tier, or, on a model server, the
 * smallest model Ollama reports, else the first listed. It
 * follows what the provider lists, so a newer model takes over on its own.
 */
export function autoModel(
  provider: ProviderId,
  options: readonly ModelOption[],
): ModelOption | undefined {
  const best = BEST[provider];
  const fitting =
    best === undefined
      ? undefined
      : options.find(({ id, label }) => best.test(id) || best.test(label));
  return fitting ?? options[0];
}

/**
 * The models a provider lists, newest or, on a server at home, smallest first;
 * none when it cannot list them, such as with a wrong key or a server that
 * is not running.
 */
export async function modelsOf(
  target: ListTarget,
  fetch: typeof globalThis.fetch,
): Promise<ModelOption[]> {
  try {
    const listed =
      target.provider === 'anthropic'
        ? await claudeModels(target.key, fetch)
        : await servedModels(target, fetch);
    return listed.slice(0, MAX_MODELS);
  } catch {
    return [];
  }
}

/**
 * What is wrong with `key`, found by asking the provider for its models:
 * '' when it answers, else the kind of failure, such as `auth`.
 */
export async function keyProblem(
  provider: KeyedProvider,
  key: string,
  fetch: typeof globalThis.fetch,
  endpoint = '',
): Promise<ProviderErrorKind | ''> {
  try {
    await (provider === 'anthropic'
      ? claudeModels(key, fetch)
      : servedModels({ provider, key, endpoint }, fetch));
    return '';
  } catch (error) {
    return kindOf(error, provider === 'anthropic' ? Anthropic : OpenAI);
  }
}

/** How long a provider's list is kept before asking again: ten minutes. */
const MODELS_FOR_MS = 600_000;

/**
 * {@link modelsOf}, kept a while per provider and key, so answering in the
 * bar or Settings does not wait on the provider's list each time.
 */
export function keptModels(
  list: typeof modelsOf = modelsOf,
  now: () => number = Date.now,
): typeof modelsOf {
  const kept = new Map<string, { readonly at: number; readonly models: ModelOption[] }>();
  return async (target, fetch) => {
    const signature = JSON.stringify(target);
    const known = kept.get(signature);
    if (known !== undefined && now() - known.at <= MODELS_FOR_MS) {
      return known.models;
    }
    const models = await list(target, fetch);
    // An empty list is a provider that did not answer, which is asked again next time.
    if (models.length > 0) {
      kept.set(signature, { at: now(), models });
    }
    return models;
  };
}
