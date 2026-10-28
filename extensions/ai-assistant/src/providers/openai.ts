import OpenAI from 'openai';
import { kindOf } from './errors.ts';
import {
  MAX_OUTPUT_TOKENS,
  ProviderError,
  REQUEST_TIMEOUT_MS,
  type Completion,
  type CompletionRequest,
  type Provider,
} from './provider.ts';

export interface OpenAISettings {
  readonly apiKey: string;
  readonly model: string;
  /**
   * An OpenAI-compatible server, such as a self-hosted one; OpenAI itself
   * when missing. Its host must be one the user allowed the extension to reach.
   */
  readonly baseURL?: string;
  /** Only for tests; the extension page's own `fetch` otherwise. */
  readonly fetch?: typeof fetch;
  /** Only for tests; {@link REQUEST_TIMEOUT_MS} otherwise. */
  readonly timeoutMs?: number;
}

/**
 * OpenAI caps output with `max_completion_tokens`; compatible servers
 * mostly still take only the older `max_tokens`.
 */
function lengthLimit(compatible: boolean) {
  return compatible
    ? { max_tokens: MAX_OUTPUT_TOKENS }
    : { max_completion_tokens: MAX_OUTPUT_TOKENS };
}

/** The streamed pieces, passed on as they come, and why the stream ended. */
async function collect(
  stream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  onText: (text: string) => void,
): Promise<{ text: string; finish: string | null }> {
  let text = '';
  let finish: string | null = null;
  for await (const chunk of stream) {
    const [choice] = chunk.choices;
    const piece = choice?.delta.content ?? '';
    if (piece !== '') {
      text += piece;
      onText(piece);
    }
    finish = choice?.finish_reason ?? finish;
  }
  return { text, finish };
}

async function streamReply(
  client: OpenAI,
  settings: OpenAISettings,
  request: CompletionRequest,
  onText: (text: string) => void,
): Promise<Completion> {
  const stream = await client.chat.completions.create(
    {
      model: settings.model,
      stream: true,
      ...lengthLimit(settings.baseURL !== undefined),
      messages: [
        { role: 'system', content: request.instructions },
        ...request.turns.map(({ role, text: content }) => ({ role, content })),
      ],
    },
    request.signal === undefined ? {} : { signal: request.signal },
  );
  const { text, finish } = await collect(stream, onText);
  if (finish === 'content_filter') {
    throw new ProviderError('refused');
  }
  return { text, truncated: finish === 'length' };
}

/**
 * OpenAI's models, or any server that speaks its chat completions API,
 * through OpenAI's official SDK. As with Claude, the key is the user's own
 * and stays in the extension's sandbox (ADR 0008, C27).
 */
export function openAIProvider(settings: OpenAISettings): Provider {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    timeout: settings.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxRetries: 2,
    ...(settings.baseURL === undefined ? {} : { baseURL: settings.baseURL }),
    ...(settings.fetch === undefined ? {} : { fetch: settings.fetch }),
  });
  return {
    complete: async (request, onText) => {
      try {
        return await streamReply(client, settings, request, onText);
      } catch (error) {
        throw error instanceof ProviderError ? error : new ProviderError(kindOf(error, OpenAI));
      }
    },
  };
}
