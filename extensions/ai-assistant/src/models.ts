import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { REQUEST_TIMEOUT_MS } from './providers/provider.ts';
import type { ExtensionHost } from '@yapyap/extension-sdk';
import { assistantSettings, keyName, missingSetup, type AssistantSettings } from './settings.ts';

/** A model the user can switch to from the bar, under a name people can read. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

/** As many models as the bar lists (ADR 0013). */
export const MAX_MODELS = 20;

/**
 * OpenAI lists every model it serves, most of which cannot chat: images,
 * speech, embeddings and moderation would only clutter the list.
 */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search/i;

/** Only for tests; the extension page's own `fetch` otherwise. */
interface Overrides {
  readonly fetch?: typeof fetch;
}

const common = (apiKey: string, overrides: Overrides) => ({
  apiKey,
  dangerouslyAllowBrowser: true,
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: 1,
  ...(overrides.fetch === undefined ? {} : { fetch: overrides.fetch }),
});

/** Claude's models, newest first, by the names Anthropic gives them. */
async function claudeModels(apiKey: string, overrides: Overrides): Promise<ModelOption[]> {
  const client = new Anthropic(common(apiKey, overrides));
  const page = await client.models.list({ limit: MAX_MODELS });
  return page.data.map((model) => ({ id: model.id, label: model.display_name }));
}

/**
 * Ollama, Alpaca's server among them, reports each model's size, which the
 * OpenAI-style list leaves out; smaller models answer faster. Other servers
 * have no such list, so their own order stands.
 */
async function sizesOf(endpoint: string, overrides: Overrides): Promise<Map<string, number>> {
  try {
    const response = await (overrides.fetch ?? fetch)(`${new URL(endpoint).origin}/api/tags`);
    const body = (await response.json()) as { models?: { name?: unknown; size?: unknown }[] };
    return new Map(
      (body.models ?? []).flatMap(({ name, size }) =>
        typeof name === 'string' && typeof size === 'number' ? [[name, size] as const] : [],
      ),
    );
  } catch {
    return new Map();
  }
}

const bySize =
  (sizes: ReadonlyMap<string, number>) =>
  (a: ModelOption, b: ModelOption): number =>
    (sizes.get(a.id) ?? Infinity) - (sizes.get(b.id) ?? Infinity);

/** What an OpenAI-compatible server lists, such as the models Ollama has installed. */
async function servedModels(
  settings: AssistantSettings,
  apiKey: string,
  overrides: Overrides,
): Promise<ModelOption[]> {
  const baseURL = settings.provider === 'compatible' ? { baseURL: settings.endpoint } : {};
  const client = new OpenAI({ ...common(apiKey, overrides), ...baseURL });
  const page = await client.models.list();
  // Newest first, as Anthropic lists Claude's, so the first fitting model is the newest.
  const options = [...page.data]
    .sort((a, b) => b.created - a.created)
    .map((model) => model.id)
    .filter((id) => settings.provider === 'compatible' || !NOT_CHAT.test(id))
    .map((id) => ({ id, label: id }));
  if (settings.provider !== 'compatible') {
    return options;
  }
  return options.sort(bySize(await sizesOf(settings.endpoint, overrides)));
}

/**
 * The tier of each provider's models made for quick, inexpensive answers,
 * which suits short chat replies: Claude's Haiku and OpenAI's mini models.
 * Naming a tier rather than a model keeps Auto on the newest one.
 */
const QUICK: Readonly<Record<AssistantSettings['provider'], RegExp | undefined>> = {
  anthropic: /haiku/i,
  openai: /mini/i,
  compatible: undefined,
};

/**
 * The model Auto uses (#467): the newest of the provider's quick tier, the
 * newest model when there is no such tier, or, on a server on this
 * computer, the smallest installed model, which answers fastest. It
 * follows what the provider lists, so a newer model takes over on its own.
 */
export function autoModel(
  provider: AssistantSettings['provider'],
  options: readonly ModelOption[],
): ModelOption | undefined {
  const quick = QUICK[provider];
  const fitting =
    quick === undefined ? undefined : options.find(({ id, label }) => quick.test(`${id} ${label}`));
  return fitting ?? options[0];
}

/** The models a provider lists, newest or, on this computer, smallest first; none when it cannot list them. */
export async function modelsOf(
  settings: AssistantSettings,
  apiKey: string,
  overrides: Overrides = {},
): Promise<ModelOption[]> {
  try {
    const listed =
      settings.provider === 'anthropic'
        ? await claudeModels(apiKey, overrides)
        : await servedModels(settings, apiKey, overrides);
    return listed.slice(0, MAX_MODELS);
  } catch {
    return [];
  }
}

/** How long a provider's list is kept before asking again: ten minutes. */
const MODELS_FOR_MS = 600_000;

/**
 * {@link modelsOf}, kept a while per provider and key, so answering in the
 * bar or the panel does not wait on the provider's list each time.
 */
export function keptModels(
  list: typeof modelsOf = modelsOf,
  now: () => number = Date.now,
): typeof modelsOf {
  const kept = new Map<string, { readonly at: number; readonly models: ModelOption[] }>();
  return async (settings, apiKey) => {
    const signature = JSON.stringify([settings.provider, settings.endpoint, apiKey]);
    const known = kept.get(signature);
    if (known !== undefined && now() - known.at <= MODELS_FOR_MS) {
      return known.models;
    }
    const models = await list(settings, apiKey);
    kept.set(signature, { at: now(), models });
    return models;
  };
}

/** The provider's list as the assistant's page asks for it: kept a while, shared by the bar and the panel. */
export const pageModels: typeof modelsOf = keptModels();

/** Where the user's pick in the bar is kept: a model's ID, or {@link AUTO}. */
export const MODEL_KEY = 'model';

/** The pick that lets the assistant choose (#467). */
export const AUTO = 'auto';

/** What the assistant runs with: the user's settings and key, and the model it uses. */
export interface Setup {
  readonly settings: AssistantSettings;
  readonly key: string | undefined;
  /** What the user picked in the bar: a model's ID, or {@link AUTO}. */
  readonly picked: string;
  /** What the provider lists, empty until the assistant is set up. */
  readonly models: readonly ModelOption[];
  /** The model Auto would use. */
  readonly auto: ModelOption | undefined;
}

type SetupHost = Pick<ExtensionHost, 'settings' | 'secrets' | 'storage'>;

/**
 * The user's settings and key, and the model to use: the one the user
 * picked while the provider still lists it, or Auto's. The provider is
 * asked for its list only once everything else is in place, so nothing is
 * sent anywhere before the assistant is set up.
 */
export async function currentSetup(host: SetupHost, list: typeof modelsOf): Promise<Setup> {
  const settings = assistantSettings(await host.settings.get());
  const key = await host.secrets.get(keyName(settings.provider));
  const models = missingSetup(settings, key) === '' ? await list(settings, key ?? '') : [];
  // The pick matters only once there is something to pick from.
  const saved = models.length === 0 ? undefined : await host.storage.get(MODEL_KEY);
  const picked = typeof saved === 'string' ? saved : AUTO;
  const auto = autoModel(settings.provider, models);
  const chosen = models.find(({ id }) => id === picked) ?? auto;
  return { settings: { ...settings, model: chosen?.id ?? '' }, key, picked, models, auto };
}
