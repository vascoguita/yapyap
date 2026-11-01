import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { openAIProvider } from './openai.ts';
import { ProviderError } from './provider.ts';

/** A streamed chat completion made of `pieces`, ending for `finish`. */
function reply(pieces: readonly string[], finish = 'stop'): string {
  const chunk = (delta: object, finishReason: string | null) => ({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'test-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
  const chunks = [
    chunk({ role: 'assistant', content: '' }, null),
    ...pieces.map((content) => chunk({ content }, null)),
    chunk({}, finish),
    // Some servers end with a usage-only chunk that has no choices.
    { ...chunk({}, null), choices: [] },
  ];
  return `${chunks.map((value) => `data: ${JSON.stringify(value)}\n\n`).join('')}data: [DONE]\n\n`;
}

function fakeFetch(response: () => Response) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    requests.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    if (init?.signal?.aborted === true) {
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }
    return Promise.resolve(response());
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

const streamed = (body: string) => () =>
  new Response(body, { headers: { 'content-type': 'text/event-stream' } });

const REQUEST = {
  instructions: 'Rewrite this more warmly.',
  turns: [
    { role: 'user' as const, text: 'Running late.' },
    { role: 'assistant' as const, text: 'No worries!' },
  ],
};

describe('openAIProvider', () => {
  it('streams the reply from OpenAI, with the instructions first', async () => {
    const fake = fakeFetch(streamed(reply(['So sorry', ', running late!'])));
    const provider = openAIProvider({ apiKey: 'sk-test', model: 'gpt-test', fetch: fake.fetch });
    const pieces: string[] = [];
    await expect(provider.complete(REQUEST, (text) => pieces.push(text))).resolves.toEqual({
      text: 'So sorry, running late!',
      truncated: false,
    });
    expect(pieces).toEqual(['So sorry', ', running late!']);
    const [request] = fake.requests;
    expect(request?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request?.headers.get('authorization')).toBe('Bearer sk-test');
    expect(request?.body).toEqual({
      model: 'gpt-test',
      stream: true,
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: 'Rewrite this more warmly.' },
        { role: 'user', content: 'Running late.' },
        { role: 'assistant', content: 'No worries!' },
      ],
    });
  });

  it('talks to a compatible server at its own address, with the older length limit', async () => {
    const fake = fakeFetch(streamed(reply(['Hi'])));
    await openAIProvider({
      apiKey: 'local',
      model: 'llama',
      baseURL: 'https://llm.example.org/v1',
      fetch: fake.fetch,
    }).complete(REQUEST, vi.fn());
    const [request] = fake.requests;
    expect(request?.url).toBe('https://llm.example.org/v1/chat/completions');
    expect(request?.body).toMatchObject({ max_tokens: 4096 });
    expect(request?.body).not.toHaveProperty('max_completion_tokens');
  });

  it('says when the reply was cut short, and fails a filtered one', async () => {
    const cut = fakeFetch(streamed(reply(['Long'], 'length')));
    await expect(
      openAIProvider({ apiKey: 'k', model: 'm', fetch: cut.fetch }).complete(REQUEST, vi.fn()),
    ).resolves.toEqual({ text: 'Long', truncated: true });
    const filtered = fakeFetch(streamed(reply([], 'content_filter')));
    await expect(
      openAIProvider({ apiKey: 'k', model: 'm', fetch: filtered.fetch }).complete(REQUEST, vi.fn()),
    ).rejects.toMatchObject({ kind: 'refused' });
  });

  it.each([
    [401, 'auth'],
    [429, 'rate-limited'],
    [404, 'bad-request'],
    [503, 'failed'],
  ])('fails a %d as %s, without the provider’s own words', async (status, kind) => {
    const fake = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'secret echo' } }), {
          status,
          headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
        }),
    );
    const error: unknown = await openAIProvider({ apiKey: 'k', model: 'm', fetch: fake.fetch })
      .complete(REQUEST, vi.fn())
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain('secret echo');
  });

  it('fails as cancelled when the user stops it', async () => {
    const fake = fakeFetch(streamed(reply(['Hi'])));
    const controller = new AbortController();
    controller.abort();
    await expect(
      openAIProvider({ apiKey: 'k', model: 'm', fetch: fake.fetch }).complete(
        { ...REQUEST, signal: controller.signal },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('fails as timeout when the server takes too long', async () => {
    // The SDK retries a timeout after backing off; fake timers skip the wait.
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const failed = expect(
      openAIProvider({
        apiKey: 'k',
        model: 'm',
        fetch: fetch as unknown as typeof globalThis.fetch,
        timeoutMs: 10,
      }).complete(REQUEST, vi.fn()),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await vi.runAllTimersAsync();
    await failed;
  });
});
