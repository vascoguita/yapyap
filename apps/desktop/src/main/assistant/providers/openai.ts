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
   * A model server on this computer that speaks OpenAI's API, such as
   * Ollama or LM Studio; OpenAI itself when missing.
   */
  readonly baseURL?: string;
  /** The assistant's own `fetch`, confined to the providers' hosts (ADR 0017). */
  readonly fetch: typeof fetch;
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
 * OpenAI's models, or a server on this computer that speaks its chat
 * completions API, through OpenAI's official SDK in the main process. As
 * with Claude, the key is the user's own (ADR 0017).
 */
export function openAIProvider(settings: OpenAISettings): Provider {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    timeout: settings.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxRetries: 2,
    fetch: settings.fetch,
    ...(settings.baseURL === undefined ? {} : { baseURL: settings.baseURL }),
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
