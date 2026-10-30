import { describe, expect, it, vi } from 'vitest';
import { anthropicProvider } from './anthropic.ts';
import { ProviderError } from './provider.ts';

const sse = (events: readonly object[]): string =>
  events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('');

/** A streamed reply made of `pieces`, ending for `stopReason`. */
function reply(pieces: readonly string[], stopReason = 'end_turn'): string {
  return sse([
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-haiku-5-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...pieces.map((text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ]);
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

/** SDK versions send the key in one header or the other. */
const keyOf = (headers: Headers | undefined): string | undefined =>
  headers?.get('x-api-key') ?? headers?.get('authorization')?.replace('Bearer ', '');

const streamed = (body: string) => () =>
  new Response(body, { headers: { 'content-type': 'text/event-stream' } });

const failing = (status: number) => () =>
  new Response(
    JSON.stringify({ type: 'error', error: { type: 'error', message: 'secret echo' } }),
    {
      status,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
    },
  );

const REQUEST = {
  instructions: 'Suggest a short reply.',
  turns: [{ role: 'user' as const, text: 'Dinner tonight?' }],
};

describe('anthropicProvider', () => {
  it('streams the reply piece by piece, and asks with the user’s key and model', async () => {
    const fake = fakeFetch(streamed(reply(['Sure', ', see you at 8.'])));
    const provider = anthropicProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-opus-5-5',
      fetch: fake.fetch,
    });
    const pieces: string[] = [];
    await expect(provider.complete(REQUEST, (text) => pieces.push(text))).resolves.toEqual({
      text: 'Sure, see you at 8.',
      truncated: false,
    });
    expect(pieces).toEqual(['Sure', ', see you at 8.']);
    const [request] = fake.requests;
    expect(request?.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages(\?|$)/);
    expect(keyOf(request?.headers)).toBe('sk-ant-test');
    // The extension page talks to the API directly, with the user's own key.
    expect(request?.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(request?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 4096,
      stream: true,
      system: 'Suggest a short reply.',
      messages: [{ role: 'user', content: 'Dinner tonight?' }],
      fallbacks: 'default',
    });
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it.each(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])(
    'asks %s to fall back on a refusal',
    async (model) => {
      const fake = fakeFetch(streamed(reply(['Hi'])));
      await anthropicProvider({ apiKey: 'k', model, fetch: fake.fetch }).complete(REQUEST, vi.fn());
      expect(fake.requests[0]?.body).toMatchObject({ model, fallbacks: 'default' });
    },
  );

  it('asks no fallbacks of a model that does not take them', async () => {
    const fake = fakeFetch(streamed(reply(['Hi'])));
    await anthropicProvider({ apiKey: 'k', model: 'claude-haiku-5-5', fetch: fake.fetch }).complete(
      REQUEST,
      vi.fn(),
    );
    expect(fake.requests[0]?.body).not.toHaveProperty('fallbacks');
  });

  it('says when the reply was cut short, and fails a refused one', async () => {
    const cut = fakeFetch(streamed(reply(['Long'], 'max_tokens')));
    const provider = anthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', fetch: cut.fetch });
    await expect(provider.complete(REQUEST, vi.fn())).resolves.toEqual({
      text: 'Long',
      truncated: true,
    });
    const refused = fakeFetch(streamed(reply([], 'refusal')));
    await expect(
      anthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', fetch: refused.fetch }).complete(
        REQUEST,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ kind: 'refused' });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limited'],
    [400, 'bad-request'],
    [404, 'bad-request'],
    [500, 'failed'],
  ])('fails a %d as %s, without the provider’s own words', async (status, kind) => {
    const fake = fakeFetch(failing(status));
    const failure = anthropicProvider({ apiKey: 'k', model: 'm', fetch: fake.fetch })
      .complete(REQUEST, vi.fn())
      .catch((error: unknown) => error);
    const error = await failure;
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain('secret echo');
  });

  it('fails as cancelled when the user stops it', async () => {
    const fake = fakeFetch(streamed(reply(['Hi'])));
    const controller = new AbortController();
    controller.abort();
    await expect(
      anthropicProvider({ apiKey: 'k', model: 'm', fetch: fake.fetch }).complete(
        { ...REQUEST, signal: controller.signal },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('uses the extension page’s own fetch unless given one', () => {
    expect(anthropicProvider({ apiKey: 'k', model: 'm' }).complete).toBeTypeOf('function');
  });

  it('fails as network when the provider cannot be reached, after retrying twice', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const failure = anthropicProvider({
      apiKey: 'k',
      model: 'm',
      fetch: fetch,
    }).complete(REQUEST, vi.fn());
    await expect(failure).rejects.toMatchObject({ kind: 'network' });
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 20_000);

  it('fails as timeout when the provider takes too long', async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const failure = anthropicProvider({
      apiKey: 'k',
      model: 'm',
      fetch: fetch as unknown as typeof globalThis.fetch,
      timeoutMs: 10,
    }).complete(REQUEST, vi.fn());
    await expect(failure).rejects.toMatchObject({ kind: 'timeout' });
  }, 20_000);
});
