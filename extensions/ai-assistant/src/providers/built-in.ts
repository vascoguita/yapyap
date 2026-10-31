import { failureOf, type Engine, type EngineTurn } from '../built-in/engine.ts';
import { ProviderError, type CompletionRequest, type Provider } from './provider.ts';

/** The request as the engine reads it: the instructions first, then the conversation. */
export const turnsOf = (request: CompletionRequest): EngineTurn[] => [
  { role: 'system', content: request.instructions },
  ...request.turns.map(({ role, text }) => ({ role, content: text })),
];

/**
 * The private model on this computer (#457), through the same interface
 * as the providers on the internet. `ready` loads it on first use, which
 * the assistant shows as warming up; nothing of the request leaves the page.
 */
export function builtInProvider(ready: () => Promise<Engine>): Provider {
  return {
    complete: async (request, onText) => {
      try {
        const engine = await ready();
        return await engine.chat(turnsOf(request), onText, request.signal);
      } catch (error) {
        throw new ProviderError(failureOf(error));
      }
    },
  };
}
