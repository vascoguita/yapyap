import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { memoryFileSystem } from '../testing/opfs.ts';
import type { BuiltInModel } from './catalog.ts';
import { download, savedBytes, savedModel } from './download.ts';
import { browserStore, type ModelStore } from './store.ts';

const FILE = new Uint8Array(Array.from({ length: 1000 }, (_, index) => index % 251));

const modelOf = (file: Uint8Array): BuiltInModel => ({
  id: 'test',
  name: 'Test',
  url: 'https://huggingface.co/test.gguf',
  size: file.length,
  sha256: createHash('sha256').update(file).digest('hex'),
});

const MODEL = modelOf(FILE);

/** A body that sends `chunks` one read at a time, then breaks off when `broken`, as a dropped connection does. */
function body(chunks: readonly Uint8Array[], broken = false): ReadableStream<Uint8Array> {
  const left = [...chunks];
  return new ReadableStream({
    pull(controller) {
      const chunk = left.shift();
      if (chunk !== undefined) {
        controller.enqueue(chunk);
      } else if (broken) {
        controller.error(new TypeError('network error'));
      } else {
        controller.close();
      }
    },
  });
}

/** A server that answers with the file from where each request's `Range` starts. */
function server(file: Uint8Array, honoursRange = true) {
  return vi.fn<typeof fetch>((_url, init) => {
    const range = new Headers(init?.headers).get('range');
    const start = honoursRange && range !== null ? Number(/\d+/.exec(range)?.[0]) : 0;
    const status = start > 0 ? 206 : 200;
    return Promise.resolve(new Response(body([file.slice(start)]), { status }));
  });
}

function setup(fetch = server(FILE), quota?: number) {
  const store = browserStore(memoryFileSystem(quota));
  const progress: number[] = [];
  const run = (model = MODEL) =>
    download(model, { store, fetch }, (done) => {
      progress.push(done);
    });
  return { store, fetch, progress, run, saved: () => savedBytes(MODEL, store) };
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('download', () => {
  it('downloads the whole file, checks it, and keeps it as one file to read', async () => {
    const t = setup();
    await expect(t.run()).resolves.toBe('done');
    expect(t.progress).toEqual([0, 1000]);
    expect(await bytesOf(await savedModel(MODEL, t.store))).toEqual(FILE);
    expect(t.fetch).toHaveBeenCalledWith(MODEL.url, {
      headers: {},
      signal: null,
      credentials: 'omit',
    });
  });

  it('saves the file in pieces as it comes', async () => {
    const chunks = [FILE.slice(0, 400), FILE.slice(400, 800), FILE.slice(800)];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body(chunks)));
    const store = browserStore(memoryFileSystem());
    await expect(download(MODEL, { store, fetch, pieceBytes: 500 }, () => undefined)).resolves.toBe(
      'done',
    );
    expect((await store.pieces(MODEL.sha256)).map(({ size }) => size)).toEqual([800, 200]);
  });

  it('keeps what came before the connection broke, and resumes from there with a Range request', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(body([FILE.slice(0, 400)], true)));
    const t = setup(fetch);
    await expect(t.run()).resolves.toBe('download-failed');
    await expect(t.saved()).resolves.toBe(400);
    fetch.mockImplementation(server(FILE));
    const controller = new AbortController();
    await expect(
      download(MODEL, { store: t.store, fetch, signal: controller.signal }, () => undefined),
    ).resolves.toBe('done');
    expect(fetch).toHaveBeenLastCalledWith(MODEL.url, {
      headers: { Range: 'bytes=400-' },
      signal: controller.signal,
      credentials: 'omit',
    });
    expect(await bytesOf(await savedModel(MODEL, t.store))).toEqual(FILE);
  });

  it('starts over when the server ignores the range', async () => {
    const t = setup(server(FILE, false));
    await t.store.save(MODEL.sha256, 0, [FILE.slice(0, 300)]);
    await expect(t.run()).resolves.toBe('done');
    expect(await bytesOf(await savedModel(MODEL, t.store))).toEqual(FILE);
  });

  it('fails, to be resumed, on a refused request, an empty answer, an early end or no network', async () => {
    for (const answer of [
      new Response(body([], true)),
      new Response('gone', { status: 404 }),
      new Response(body([FILE]), { status: 206 }),
      new Response(null, { status: 200 }),
      new Response(body([FILE.slice(0, 10)])),
    ]) {
      const t = setup(vi.fn<typeof fetch>().mockResolvedValue(answer));
      await expect(t.run()).resolves.toBe('download-failed');
    }
    const offline = setup(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    await expect(offline.run()).resolves.toBe('download-failed');
  });

  it('refuses and deletes a file that does not match its SHA-256 or runs past its size', async () => {
    const tampered = FILE.slice();
    tampered[500] = 0;
    const t = setup(server(tampered));
    await expect(t.run()).resolves.toBe('damaged');
    await expect(t.saved()).resolves.toBe(0);
    const long = setup(server(new Uint8Array(1001)));
    await expect(long.run()).resolves.toBe('damaged');
    await expect(long.saved()).resolves.toBe(0);
  });

  it('only checks a file already all there, deleting it if it does not match', async () => {
    const fetch = server(FILE);
    const t = setup(fetch);
    await t.store.save(MODEL.sha256, 0, [FILE]);
    await expect(t.run()).resolves.toBe('done');
    await t.store.clear(MODEL.sha256);
    await t.store.save(MODEL.sha256, 0, [new Uint8Array(1000)]);
    await expect(t.run()).resolves.toBe('damaged');
    await expect(t.saved()).resolves.toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says the disk is full before it starts, or when a piece does not fit', async () => {
    const t = setup(server(FILE), 999);
    await expect(t.run()).resolves.toBe('disk-full');
    expect(t.fetch).not.toHaveBeenCalled();
    const store: ModelStore = {
      ...browserStore(memoryFileSystem()),
      save: () => Promise.reject(new DOMException('Full.', 'QuotaExceededError')),
    };
    await expect(download(MODEL, { store, fetch: server(FILE) }, () => undefined)).resolves.toBe(
      'disk-full',
    );
  });
});
