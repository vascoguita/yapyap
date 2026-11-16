import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_OUTPUT_TOKENS,
  ProviderError,
  REQUEST_TIMEOUT_MS,
  type CompletionRequest,
  type Provider,
} from './provider.ts';
import { kindOf } from './errors.ts';

/**
 * Models that accept server-side refusal fallbacks, so a declined request is
 * retried on another model inside the same call instead of failing.
 */
const FALLBACK_MODELS: ReadonlySet<string> = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude's models that take an effort level: Fable and Mythos, and Opus,
 * Sonnet and Haiku from their 5 versions. Older ones, such as Haiku 4.5,
 * refuse the request when it names one.
 */
const TAKES_EFFORT = /^claude-(?:fable|mythos|(?:opus|sonnet|haiku)-[5-9])/;

/**
 * A short chat message needs little thought, and the newest models think
 * at length unless told otherwise, which only makes the user wait.
 */
const effortFor = (model: string) =>
  TAKES_EFFORT.test(model) ? { output_config: { effort: 'low' as const } } : {};

/**
 * The chat, marked for caching, then the task: a rewrite after suggestions,
 * or suggestions for the next message, reads the chat from the cache.
 */
const userTurn = ({ context, task }: CompletionRequest) => ({
  role: 'user' as const,
  content: [
    { type: 'text' as const, text: context, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: task },
  ],
});

export interface AnthropicSettings {
  readonly apiKey: string;
  readonly model: string;
  /** The assistant's own `fetch`, confined to the providers' hosts (ADR 0017). */
  readonly fetch: typeof fetch;
  /** Only for tests; {@link REQUEST_TIMEOUT_MS} otherwise. */
  readonly timeoutMs?: number;
}

async function streamReply(
  client: Anthropic,
  model: string,
  request: CompletionRequest,
): Promise<string> {
  const fallbacks = FALLBACK_MODELS.has(model)
    ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
    : {};
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.instructions,
      messages: [userTurn(request)],
      ...effortFor(model),
      ...fallbacks,
    },
    request.signal === undefined ? {} : { signal: request.signal },
  );
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
    }
  }
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new ProviderError('refused');
  }
  return text;
}

/**
 * Claude, through Anthropic's official SDK, in the main process. The key is
 * the user's own, kept encrypted by YapYap's secret store, and every request
 * goes through the assistant's own confined `fetch` (ADR 0017).
 */
export function anthropicProvider(settings: AnthropicSettings): Provider {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    timeout: settings.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxRetries: 2,
    fetch: settings.fetch,
  });
  return {
    complete: async (request) => {
      try {
        return await streamReply(client, settings.model, request);
      } catch (error) {
        throw error instanceof ProviderError ? error : new ProviderError(kindOf(error, Anthropic));
      }
    },
  };
}
