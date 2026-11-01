import type { SettingsService } from '../settings/service.ts';
import type { AssistantKeys } from './keys.ts';
import type { modelsOf } from './models.ts';
import type { EngineHost } from './private/engine-host.ts';
import type { PrivateModels } from './private/private-model.ts';
import { requestFor } from './replies.ts';
import { currentSetup, providerFor, type Setup } from './setup.ts';

export interface CoreDependencies {
  readonly settings: Pick<SettingsService, 'current'>;
  readonly keys: Pick<AssistantKeys, 'get'>;
  readonly privateModels: Pick<PrivateModels, 'ready'>;
  readonly engine: Pick<EngineHost, 'complete'>;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  /** The providers' lists, kept a while. */
  readonly list: typeof modelsOf;
}

/** What every part of the assistant asks of its setup and its model. */
export interface AssistantCore {
  readonly setup: () => Promise<Setup>;
  /**
   * The model's answer to `instructions` about `text`, which is exactly
   * what is sent. Nothing about it is logged.
   */
  readonly ask: (
    setup: Setup,
    instructions: string,
    text: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}

/** The assistant's setup and its model, from the settings, the keys and the private model. */
export function assistantCore(deps: CoreDependencies): AssistantCore {
  return {
    setup: async () => {
      const keys = {
        anthropic: await deps.keys.get('anthropic'),
        openai: await deps.keys.get('openai'),
      };
      const settings = deps.settings.current().assistant;
      const privateModel = deps.privateModels.ready();
      return currentSetup({ settings, keys, privateModel }, deps.list, deps.fetch);
    },
    ask: async (setup, instructions, text, signal) => {
      const provider = providerFor(setup, deps.fetch, deps.engine);
      const completion = await provider.complete(
        requestFor(instructions, text, signal),
        () => undefined,
      );
      return completion.text;
    },
  };
}
