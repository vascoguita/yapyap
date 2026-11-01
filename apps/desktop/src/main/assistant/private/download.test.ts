import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateModel } from './catalog.ts';
import { download } from './download.ts';
import type { ModelFiles } from './files.ts';

const BYTES = new TextEncoder().encode('a tiny model, as bytes');

const MODEL: PrivateModel = {
  id: 'tiny',
  name: 'Tiny',
  url: 'https://models.example/tiny.gguf',
  size: BYTES.length,
  sha256: createHash('sha256').update(BYTES).digest('hex'),
};

/** Model files in memory: the partial download, and whether it was made the model. */
function memoryFiles(saved: Uint8Array = new Uint8Array(), free?: number) {
  const state = { partial: saved, finished: false, discarded: 0, writes: 0 };
  const files: ModelFiles = {
    path: () => '/models/tiny.gguf',
    saved: () => Promise.resolve(state.partial.length),
    read: async function* () {
      await Promise.resolve();
      if (state.partial.length > 0) {
        yield state.partial;
      }
    },
    append: (_model, fresh) => {
      if (fresh) {
        state.partial = new Uint8Array();
      }
      return Promise.resolve({
        write: (chunk) => {
          state.writes += 1;
          state.partial = new Uint8Array([...state.partial, ...chunk]);
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      });
    },
    finish: () => {
      state.finished = true;
      return Promise.resolve();
    },
    discard: () => {
      state.discarded += 1;
      state.partial = new Uint8Array();
      return Promise.resolve();
    },
    clear: vi.fn(),
    used: vi.fn(),
    free: () => Promise.resolve(free),
  };
  return { files, state };
}

/** A body that yields `pieces`, then fails with `error` if given. */
function body(pieces: readonly Uint8Array[], error?: Error): ReadableStream<Uint8Array> {
  return ReadableStream.from(
    (async function* () {
      for (const piece of pieces) {
        yield await Promise.resolve(piece);
      }
      if (error !== undefined) {
        throw error;
      }
    })(),
  );
}

const answering = (status: number, stream: ReadableStream<Uint8Array> | null) =>
  vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(stream, { status })));

const signal = () => new AbortController().signal;

describe('download', () => {
  it('downloads the whole file, checks its hash and keeps it', async () => {
    const { files, state } = memoryFiles();
    const fetch = answering(200, body([BYTES.subarray(0, 5), BYTES.subarray(5)]));
    const progress: number[] = [];
    await expect(
      download(MODEL, { files, fetch, signal: signal() }, (done) => progress.push(done)),
    ).resolves.toBe('done');
    expect(state.finished).toBe(true);
    expect(progress).toEqual([0, 5, BYTES.length]);
    expect(fetch.mock.calls[0]?.[0]).toBe(MODEL.url);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ headers: {} });
  });

  it('resumes from what an earlier download kept, asking only for the rest', async () => {
    const { files, state } = memoryFiles(BYTES.subarray(0, 4));
    const fetch = answering(206, body([BYTES.subarray(4)]));
    await expect(download(MODEL, { files, fetch, signal: signal() }, vi.fn())).resolves.toBe(
      'done',
    );
    expect(fetch.mock.calls[0]).toMatchObject([MODEL.url, { headers: { Range: 'bytes=4-' } }]);
    expect(state.partial).toEqual(BYTES);
  });

  it('starts over when the server ignores the range', async () => {
    const { files, state } = memoryFiles(BYTES.subarray(0, 4));
    await expect(
      download(MODEL, { files, fetch: answering(200, body([BYTES])), signal: signal() }, vi.fn()),
    ).resolves.toBe('done');
    expect(state.partial).toEqual(BYTES);
  });

  it('starts over when more was kept than the model holds', async () => {
    const { files, state } = memoryFiles(new Uint8Array(BYTES.length + 1));
    await expect(
      download(MODEL, { files, fetch: answering(200, body([BYTES])), signal: signal() }, vi.fn()),
    ).resolves.toBe('done');
    expect(state.discarded).toBe(1);
  });

  it('verifies a download that was all there before a restart', async () => {
    const { files, state } = memoryFiles(BYTES);
    const fetch = vi.fn();
    await expect(download(MODEL, { files, fetch, signal: signal() }, vi.fn())).resolves.toBe(
      'done',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(state.finished).toBe(true);
  });

  it('fails on an answer that is neither the file nor its rest', async () => {
    for (const fetch of [answering(404, null), answering(200, null)]) {
      const { files } = memoryFiles();
      await expect(download(MODEL, { files, fetch, signal: signal() }, vi.fn())).resolves.toBe(
        'failed',
      );
    }
    const { files } = memoryFiles();
    await expect(
      download(MODEL, { files, fetch: answering(206, body([BYTES])), signal: signal() }, vi.fn()),
    ).resolves.toBe('failed');
  });

  it('keeps what came when the connection breaks, or ends early', async () => {
    const broken = memoryFiles();
    const fetch = answering(200, body([BYTES.subarray(0, 3)], new Error('reset')));
    await expect(
      download(MODEL, { files: broken.files, fetch, signal: signal() }, vi.fn()),
    ).resolves.toBe('failed');
    expect(broken.state.partial).toEqual(BYTES.subarray(0, 3));
    const short = memoryFiles();
    await expect(
      download(
        MODEL,
        {
          files: short.files,
          fetch: answering(200, body([BYTES.subarray(0, 3)])),
          signal: signal(),
        },
        vi.fn(),
      ),
    ).resolves.toBe('failed');
    expect(short.state.discarded).toBe(0);
  });

  it('deletes a file that is not the pinned one, or grows past its size', async () => {
    const wrong = memoryFiles();
    const other = new Uint8Array(BYTES.length);
    await expect(
      download(
        MODEL,
        { files: wrong.files, fetch: answering(200, body([other])), signal: signal() },
        vi.fn(),
      ),
    ).resolves.toBe('damaged');
    expect(wrong.state).toMatchObject({ finished: false, discarded: 1 });
    const long = memoryFiles();
    await expect(
      download(
        MODEL,
        { files: long.files, fetch: answering(200, body([BYTES, BYTES])), signal: signal() },
        vi.fn(),
      ),
    ).resolves.toBe('damaged');
    expect(long.state.discarded).toBe(1);
  });

  it('pauses when stopped, keeping what came', async () => {
    const { files } = memoryFiles();
    const controller = new AbortController();
    const fetch = vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(
      download(MODEL, { files, fetch, signal: controller.signal }, vi.fn()),
    ).resolves.toBe('paused');
  });

  it('says the disk is full before starting, or when a write finds it so', async () => {
    const { files, state } = memoryFiles(BYTES.subarray(0, 4), BYTES.length - 5);
    const fetch = vi.fn();
    await expect(download(MODEL, { files, fetch, signal: signal() }, vi.fn())).resolves.toBe(
      'disk-full',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(state.partial).toHaveLength(4);
    for (const code of ['ENOSPC', 'EDQUOT']) {
      const full = memoryFiles(new Uint8Array(), BYTES.length);
      full.files = {
        ...full.files,
        append: () =>
          Promise.resolve({
            write: () => Promise.reject(Object.assign(new Error('full'), { code })),
            close: () => Promise.resolve(),
          }),
      };
      await expect(
        download(
          MODEL,
          { files: full.files, fetch: answering(200, body([BYTES])), signal: signal() },
          vi.fn(),
        ),
      ).resolves.toBe('disk-full');
    }
  });
});
