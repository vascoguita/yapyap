import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_OUTPUT_TOKENS,
  ProviderError,
  REQUEST_TIMEOUT_MS,
  type Completion,
  type CompletionRequest,
  type Provider,
} from './provider.ts';
import { kindOf } from './errors.ts';

/** The model the assistant uses until the user picks another. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

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

export interface AnthropicSettings {
  readonly apiKey: string;
  readonly model: string;
  /** Only for tests; the plugin page's own `fetch` otherwise. */
  readonly fetch?: typeof fetch;
  /** Only for tests; {@link REQUEST_TIMEOUT_MS} otherwise. */
  readonly timeoutMs?: number;
}

async function streamReply(
  client: Anthropic,
  model: string,
  request: CompletionRequest,
  onText: (text: string) => void,
): Promise<Completion> {
  const fallbacks = FALLBACK_MODELS.has(model)
    ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
    : {};
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.instructions,
      messages: request.turns.map(({ role, text: content }) => ({ role, content })),
      ...fallbacks,
    },
    request.signal === undefined ? {} : { signal: request.signal },
  );
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
      onText(event.delta.text);
    }
  }
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new ProviderError('refused');
  }
  return { text, truncated: message.stop_reason === 'max_tokens' };
}

/**
 * Claude, through Anthropic's official SDK. The key is the user's own, kept
 * by YapYap's secrets API and used only inside this plugin's sandbox, which
 * is why the SDK's browser guard is turned off (ADR 0008).
 */
export function anthropicProvider(settings: AnthropicSettings): Provider {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    timeout: settings.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxRetries: 2,
    ...(settings.fetch === undefined ? {} : { fetch: settings.fetch }),
  });
  return {
    complete: async (request, onText) => {
      try {
        return await streamReply(client, settings.model, request, onText);
      } catch (error) {
        throw error instanceof ProviderError ? error : new ProviderError(kindOf(error, Anthropic));
      }
    },
  };
}
