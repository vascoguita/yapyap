import { isModelServer } from '../../shared/model-server.ts';
import type { KeyedProvider } from '../../shared/api/chrome-api.ts';
import type { Settings } from '../settings/schema.ts';
import { autoModel, NO_KEY, type modelsOf, type ModelOption, type ProviderId } from './models.ts';
import { anthropicProvider } from './providers/anthropic.ts';
import { openAIProvider } from './providers/openai.ts';
import type { Provider } from './providers/provider.ts';

type AssistantSettings = Settings['assistant'];

/** What decides who answers. */
export interface SetupInputs {
  readonly settings: AssistantSettings;
  /** The user's keys, by provider; undefined where none is saved. */
  readonly keys: Readonly<Record<KeyedProvider, string | undefined>>;
}

/**
 * Why the assistant cannot answer yet, or '' when it can: it is off, no
 * provider is chosen or the server has no address, the chosen service
 * lacks its key, or the provider listed no model.
 */
type Missing = '' | 'off' | 'setup' | 'key' | 'model';

/** Who answers, with what, and what is missing. */
export interface Setup {
  readonly provider: ProviderId | undefined;
  readonly missing: Missing;
  /** The provider's models, empty until it is set up; never asked before. */
  readonly models: readonly ModelOption[];
  /** The model Auto would use. */
  readonly auto: ModelOption | undefined;
  /** The model in use: the user's pick while the provider still lists it, or Auto's. */
  readonly model: string;
  readonly key: string;
  readonly endpoint: string;
}

/** Who answers (ADR 0017): the provider the user chose, or nobody until they choose (#627). */
export function chosenProvider(settings: AssistantSettings): ProviderId | undefined {
  return settings.provider === 'none' ? undefined : settings.provider;
}

/** What the provider still needs before it can be asked anything, its list of models included. */
function missingFor(provider: ProviderId | undefined, inputs: SetupInputs): Missing {
  switch (provider) {
    case undefined:
      return 'setup';
    case 'server':
      // A key is up to the server: most at home take none.
      return isModelServer(inputs.settings.server) ? '' : 'setup';
    default:
      return inputs.keys[provider] === undefined ? 'key' : '';
  }
}

/**
 * The setup as it stands. The provider is asked for its models only once
 * everything else is in place, so nothing is sent anywhere before the
 * assistant is set up.
 */
export async function currentSetup(
  inputs: SetupInputs,
  list: typeof modelsOf,
  fetch: typeof globalThis.fetch,
): Promise<Setup> {
  const provider = chosenProvider(inputs.settings);
  const { key, endpoint } = reachOf(provider, inputs);
  const before = inputs.settings.enabled ? missingFor(provider, inputs) : 'off';
  const none = { provider, key, endpoint, models: [], auto: undefined, model: '' };
  if (before !== '' || provider === undefined) {
    return { ...none, missing: before };
  }
  const models = await list({ provider, key, endpoint }, fetch);
  return { ...none, ...picked(provider, models, inputs.settings.model) };
}

/** The key, and for a model server its address, the provider is reached with. */
function reachOf(
  provider: ProviderId | undefined,
  inputs: SetupInputs,
): { readonly key: string; readonly endpoint: string } {
  if (provider === undefined) {
    return { key: '', endpoint: '' };
  }
  return {
    key: inputs.keys[provider] ?? '',
    endpoint: provider === 'server' ? inputs.settings.server : '',
  };
}

/** The model in use: the user's pick while the provider lists it, or Auto's. */
function picked(
  provider: ProviderId,
  models: readonly ModelOption[],
  pick: string,
): Pick<Setup, 'models' | 'auto' | 'model' | 'missing'> {
  const auto = autoModel(provider, models);
  const chosen = models.find(({ id }) => id === pick) ?? auto;
  return {
    models,
    auto,
    model: chosen?.id ?? '',
    missing: chosen === undefined ? 'model' : '',
  };
}

/** The provider a complete setup describes. */
export function providerFor(setup: Setup, fetch: typeof globalThis.fetch): Provider {
  const { model, key: apiKey } = setup;
  switch (setup.provider) {
    case 'anthropic':
      return anthropicProvider({ apiKey, model, fetch });
    case 'openai':
      return openAIProvider({ apiKey, model, fetch });
    default:
      return openAIProvider({ model, fetch, apiKey: apiKey || NO_KEY, baseURL: setup.endpoint });
  }
}
