import type { SettingsService } from '../settings/service.ts';
import type { AssistantKeys } from './keys.ts';
import type { modelsOf } from './models.ts';
import type { Prompt } from './prompts.ts';
import { currentSetup, providerFor, type Setup } from './setup.ts';

export interface CoreDependencies {
  readonly settings: Pick<SettingsService, 'current'>;
  readonly keys: Pick<AssistantKeys, 'get'>;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  /** The providers' lists, kept a while. */
  readonly list: typeof modelsOf;
}

/** What every part of the assistant asks of its setup and its model. */
export interface AssistantCore {
  readonly setup: () => Promise<Setup>;
  /** The model's answer to `prompt`, which is exactly what is sent. Nothing about it is logged. */
  readonly ask: (setup: Setup, prompt: Prompt, signal?: AbortSignal) => Promise<string>;
}

/** The assistant's setup and its model, from the settings and the keys. */
export function assistantCore(deps: CoreDependencies): AssistantCore {
  return {
    setup: async () => {
      const keys = {
        anthropic: await deps.keys.get('anthropic'),
        openai: await deps.keys.get('openai'),
        server: await deps.keys.get('server'),
      };
      const settings = deps.settings.current().assistant;
      return currentSetup({ settings, keys }, deps.list, deps.fetch);
    },
    ask: async (setup, prompt, signal) => {
      const provider = providerFor(setup, deps.fetch);
      return provider.complete(signal === undefined ? prompt : { ...prompt, signal });
    },
  };
}
