import { describe, expect, it, vi } from 'vitest';
import { cappedFetcher, latestFetcher, guardedSession, type RequestFilter } from './fetch.ts';

/** A response whose body arrives in `chunks`, recording whether it was cancelled. */
function streamed(chunks: number[][], ok = true) {
  const cancelled = vi.fn();
  let next = 0;
  // Chunks are handed out one read at a time, so the stream is still open when it is cancelled.
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[next];
        next += 1;
        if (chunk === undefined) {
          controller.close();
        } else {
          controller.enqueue(new Uint8Array(chunk));
        }
      },
      cancel: cancelled,
    },
    { highWaterMark: 0 },
  );
  return { response: { ok, body }, cancelled };
}

describe('cappedFetcher', () => {
  it('joins a body that arrives in pieces', async () => {
    const { response } = streamed([[1, 2], [3], [4, 5]]);
    const fetcher = cappedFetcher(() => Promise.resolve(response), 5);
    expect(await fetcher('https://packages.example/a')).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('stops reading as soon as a body passes the limit', async () => {
    const { response, cancelled } = streamed([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(await cappedFetcher(() => Promise.resolve(response), 5)('https://x')).toBeUndefined();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('downloads nothing for an error status, an empty body or a failed request', async () => {
    expect(
      await cappedFetcher(() => Promise.resolve(streamed([[1]], false).response), 5)('https://x'),
    ).toBeUndefined();
    expect(
      await cappedFetcher(() => Promise.resolve({ ok: true, body: null }), 5)('https://x'),
    ).toBeUndefined();
    expect(
      await cappedFetcher(() => Promise.reject(new Error('offline')), 5)('https://x'),
    ).toBeUndefined();
  });
});

describe('latestFetcher', () => {
  const answer = (
    headers: Record<string, string> = {},
    options: { ok?: boolean; chunks?: number[][] | null } = {},
  ) => ({
    ...streamed(options.chunks ?? [[1, 2]], options.ok ?? true).response,
    ...(options.chunks === null ? { body: null } : {}),
    headers: { get: (name: string) => headers[name] ?? null },
  });

  it('asks with HEAD for what identifies the file, and downloads it with the same', async () => {
    const request = vi.fn(() =>
      Promise.resolve(answer({ etag: '"v1"', 'last-modified': 'Fri, 30 Oct 2026 08:00:00 GMT' })),
    );
    const fetcher = latestFetcher(request, 5);
    const validators = { etag: '"v1"', lastModified: 'Fri, 30 Oct 2026 08:00:00 GMT' };
    expect(await fetcher.head('https://x/latest')).toEqual(validators);
    expect(request).toHaveBeenLastCalledWith('https://x/latest', 'HEAD');
    expect(await fetcher.download('https://x/latest')).toEqual({
      bytes: new Uint8Array([1, 2]),
      validators,
    });
    expect(request).toHaveBeenLastCalledWith('https://x/latest', 'GET');
  });

  it('keeps only one validator, or none, when that is all the server says', async () => {
    const only = latestFetcher(() => Promise.resolve(answer({ 'last-modified': 'Fri' })), 5);
    expect(await only.head('https://x')).toEqual({ etag: null, lastModified: 'Fri' });
    const none = latestFetcher(() => Promise.resolve(answer({ etag: 'x'.repeat(201) })), 5);
    expect(await none.head('https://x')).toBeUndefined();
    expect(await none.download('https://x')).toEqual({ bytes: new Uint8Array([1, 2]) });
  });

  it.each([
    ['an error status', answer({ etag: '"v1"' }, { ok: false })],
    ['no body', answer({ etag: '"v1"' }, { chunks: null })],
    ['a body over the limit', answer({ etag: '"v1"' }, { chunks: [[1, 2, 3, 4, 5, 6]] })],
  ])('downloads nothing for %s', async (_case, response) => {
    const fetcher = latestFetcher(() => Promise.resolve(response), 5);
    expect(await fetcher.download('https://x')).toBeUndefined();
  });

  it('says nothing for a refused HEAD or a failed request', async () => {
    const refused = latestFetcher(
      () => Promise.resolve(answer({ etag: '"v1"' }, { ok: false })),
      5,
    );
    expect(await refused.head('https://x')).toBeUndefined();
    const offline = latestFetcher(() => Promise.reject(new Error('offline')), 5);
    expect(await offline.head('https://x')).toBeUndefined();
    expect(await offline.download('https://x')).toBeUndefined();
  });
});

describe('guardedSession', () => {
  it('makes the session once, refusing from its first request what is not secure, redirects included', () => {
    let listener: Parameters<RequestFilter['onBeforeRequest']>[0] | undefined;
    const made = {
      webRequest: {
        onBeforeRequest: vi.fn((added: Parameters<RequestFilter['onBeforeRequest']>[0]) => {
          listener = added;
        }),
      },
    };
    const open = vi.fn(() => made);
    const marketplaceSession = guardedSession(open, (url) => url.startsWith('https://'));
    expect(open).not.toHaveBeenCalled();
    expect(marketplaceSession()).toBe(made);
    expect(marketplaceSession()).toBe(made);
    expect(open).toHaveBeenCalledOnce();
    expect(made.webRequest.onBeforeRequest).toHaveBeenCalledOnce();
    const decide = (url: string) => {
      const callback = vi.fn();
      listener?.({ url }, callback);
      return callback.mock.calls[0]?.[0] as unknown;
    };
    expect(decide('https://cdn.example/hello')).toEqual({ cancel: false });
    expect(decide('http://cdn.example/hello')).toEqual({ cancel: true });
  });
});
