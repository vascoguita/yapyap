import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateModelRecord } from '../state.ts';
import type { Catalog, PrivateModel } from './catalog.ts';
import type { ModelFiles } from './files.ts';
import { privateModels } from './private-model.ts';

const BYTES = new TextEncoder().encode('a tiny model');
const SMALL_BYTES = new TextEncoder().encode('tiny');

const model = (id: string, bytes: Uint8Array): PrivateModel => ({
  id,
  name: id,
  url: `https://huggingface.co/${id}.gguf`,
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

const CATALOG: Catalog = { standard: model('standard', BYTES), small: model('small', SMALL_BYTES) };
const GIB = 1024 ** 3;

/** Model files in memory, by SHA-256: partial downloads, and finished ones. */
function memoryFiles() {
  const partial = new Map<string, Uint8Array>();
  const finished = new Map<string, Uint8Array>();
  const files: ModelFiles = {
    path: (of) => `/models/${of.sha256}.gguf`,
    saved: (of) => Promise.resolve(partial.get(of.sha256)?.length ?? 0),
    read: async function* (of) {
      const bytes = partial.get(of.sha256);
      if (bytes !== undefined) {
        yield await Promise.resolve(bytes);
      }
    },
    append: (of, fresh) => {
      if (fresh) {
        partial.set(of.sha256, new Uint8Array());
      }
      return Promise.resolve({
        write: (chunk) => {
          partial.set(of.sha256, new Uint8Array([...(partial.get(of.sha256) ?? []), ...chunk]));
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      });
    },
    finish: (of) => {
      finished.set(of.sha256, partial.get(of.sha256) ?? new Uint8Array());
      partial.delete(of.sha256);
      return Promise.resolve();
    },
    discard: (of) => {
      partial.delete(of.sha256);
      return Promise.resolve();
    },
    clear: () => {
      partial.clear();
      finished.clear();
      return Promise.resolve();
    },
    used: () =>
      Promise.resolve(
        [...partial.values(), ...finished.values()].reduce(
          (total, bytes) => total + bytes.length,
          0,
        ),
      ),
    free: () => Promise.resolve(undefined),
  };
  return { files, partial, finished };
}

/** A server for the catalog's files; `gate` holds each answer back until it resolves. */
function serving(gate: () => Promise<void> = () => Promise.resolve()) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new Request(input).url;
    await gate();
    if (init?.signal?.aborted === true) {
      throw new DOMException('aborted', 'AbortError');
    }
    const bytes = url.includes('small') ? SMALL_BYTES : BYTES;
    return new Response(bytes, { status: 200 });
  });
}

function manager(fetch: typeof globalThis.fetch = serving(), memory = 16 * GIB) {
  let record: PrivateModelRecord | undefined;
  const state = {
    privateModel: () => record,
    setPrivateModel: (next: PrivateModelRecord | undefined) => {
      record = next;
    },
  };
  const disk = memoryFiles();
  const closeEngine = vi.fn();
  let clock = 0;
  const models = privateModels({
    state,
    files: disk.files,
    fetch,
    catalog: CATALOG,
    hardware: () => ({ memory, cores: 8 }),
    closeEngine,
    now: () => (clock += 600),
  });
  return { models, disk, closeEngine, record: () => record };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('privateModels', () => {
  it('offers the model that suits the computer, then downloads and verifies it on request', async () => {
    const { models, record } = manager();
    expect(await models.status()).toEqual({
      model: CATALOG.standard,
      phase: { kind: 'none' },
      smaller: true,
      used: 0,
    });
    expect(models.ready()).toBeUndefined();
    expect(models.file()).toBeUndefined();
    const changed = vi.fn();
    models.onChange(changed);
    models.download();
    models.download();
    await settled();
    await settled();
    expect(record()).toEqual({ id: 'standard', ready: true });
    expect(models.ready()).toBe(CATALOG.standard);
    expect(models.file()).toBe(`/models/${CATALOG.standard.sha256}.gguf`);
    expect((await models.status()).phase).toEqual({ kind: 'ready' });
    expect(changed).toHaveBeenCalled();
    const weak = manager(serving(), 4 * GIB);
    expect((await weak.models.status()).model).toBe(CATALOG.small);
    expect((await weak.models.status()).smaller).toBe(false);
  });

  it('pauses on request, keeping what came, and says so after a restart too', async () => {
    let open = (): void => undefined;
    const gate = () =>
      new Promise<void>((resolve) => {
        open = resolve;
      });
    const { models, disk } = manager(serving(gate));
    models.download();
    await settled();
    expect((await models.status()).phase).toEqual({ kind: 'downloading', done: 0 });
    models.pause();
    open();
    await settled();
    await settled();
    expect((await models.status()).phase).toEqual({ kind: 'paused', problem: '', done: 0 });
    disk.partial.set(CATALOG.standard.sha256, BYTES.subarray(0, 3));
    const again = privateModels({
      state: { privateModel: () => ({ id: 'standard', ready: false }), setPrivateModel: vi.fn() },
      files: disk.files,
      fetch: serving(),
      catalog: CATALOG,
      hardware: () => ({ memory: 16 * GIB, cores: 8 }),
      closeEngine: vi.fn(),
      now: () => 0,
    });
    expect((await again.status()).phase).toEqual({ kind: 'paused', problem: '', done: 3 });
  });

  it('says why a download stopped: a broken connection, or a damaged file', async () => {
    const broken = manager(vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))));
    broken.models.download();
    await settled();
    await settled();
    expect((await broken.models.status()).phase).toEqual({
      kind: 'paused',
      problem: 'failed',
      done: 0,
    });
    const wrong = manager(vi.fn(() => Promise.resolve(new Response(new Uint8Array(BYTES.length)))));
    wrong.models.download();
    await settled();
    await settled();
    expect((await wrong.models.status()).phase).toEqual({ kind: 'damaged' });
    const failing = manager(vi.fn(() => Promise.reject(new Error('down'))));
    failing.disk.files = { ...failing.disk.files };
    failing.models.download();
    await settled();
    await settled();
    expect((await failing.models.status()).phase.kind).toBe('paused');
  });

  it('says when the disk has no room for the model', async () => {
    const { models, disk } = manager();
    vi.spyOn(disk.files, 'free').mockResolvedValue(1);
    models.download();
    await settled();
    await settled();
    expect((await models.status()).phase).toEqual({
      kind: 'paused',
      problem: 'disk-full',
      done: 0,
    });
  });

  it('recovers when the download cannot even begin', async () => {
    const { models, disk } = manager();
    vi.spyOn(disk.files, 'saved').mockRejectedValueOnce(new Error('EIO'));
    models.download();
    await settled();
    await settled();
    expect((await models.status()).phase).toEqual({ kind: 'none' });
  });

  it('swaps for the smaller model after running out of memory, and removes models on request', async () => {
    const { models, record, closeEngine, disk } = manager();
    models.download();
    await settled();
    await settled();
    models.outOfMemory();
    expect((await models.status()).phase).toEqual({ kind: 'out-of-memory' });
    await models.smaller();
    await settled();
    await settled();
    expect(closeEngine).toHaveBeenCalledOnce();
    expect(record()).toEqual({ id: 'small', ready: true });
    expect(disk.finished.has(CATALOG.standard.sha256)).toBe(false);
    expect((await models.status()).smaller).toBe(false);
    await models.remove();
    expect(record()).toBeUndefined();
    expect(await models.status()).toMatchObject({ phase: { kind: 'none' }, used: 0 });
  });
});
