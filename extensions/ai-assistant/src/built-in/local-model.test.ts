import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../providers/provider.ts';
import { fakeHost } from '../testing/fake-host.ts';
import { memoryFileSystem } from '../testing/opfs.ts';
import type { BuiltInModel, Catalog } from './catalog.ts';
import type { Engine } from './engine.ts';
import { localModel, type LocalState } from './local-model.ts';
import { browserStore } from './store.ts';

const fileOf = (fill: number) => new Uint8Array(100).fill(fill);

const modelOf = (id: string, file: Uint8Array): BuiltInModel => ({
  id,
  name: id.toUpperCase(),
  url: `https://huggingface.co/${id}.gguf`,
  size: file.length,
  sha256: createHash('sha256').update(file).digest('hex'),
});

const STANDARD = fileOf(1);
const SMALL = fileOf(2);
const CATALOG: Catalog = { standard: modelOf('std', STANDARD), small: modelOf('sml', SMALL) };

/** A server with both models, which answers each from its `Range`. */
const server = vi.fn<typeof fetch>((url, init) => {
  const file = typeof url === 'string' && url.includes('std') ? STANDARD : SMALL;
  const start = Number(/\d+/.exec(new Headers(init?.headers).get('range') ?? '0')?.[0]);
  return Promise.resolve(new Response(file.slice(start), { status: start > 0 ? 206 : 200 }));
});

function fakeEngine(): Engine & { [K in keyof Engine]: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(() => Promise.resolve()),
    chat: vi.fn((_turns, onText: (text: string) => void) => {
      onText('Hi');
      return Promise.resolve({ text: 'Hi', truncated: false });
    }),
    unload: vi.fn(() => Promise.resolve()),
  };
}

function setup(options: { memoryGb?: number; fetch?: typeof fetch } = {}) {
  const fake = fakeHost();
  const files = memoryFileSystem();
  const store = browserStore(files);
  const engine = fakeEngine();
  let clock = 0;
  const catalog = vi.fn(() => Promise.resolve(CATALOG));
  const local = localModel({
    host: fake.host,
    store,
    engine,
    fetch: options.fetch ?? server,
    hardware: () => ({ memoryGb: options.memoryGb ?? 16, cores: 8 }),
    catalog,
    now: () => clock,
  });
  const heard: LocalState[] = [];
  local.onChange((state) => heard.push(state));
  const kinds = () => heard.map(({ phase }) => phase.kind);
  const tick = (ms: number) => {
    clock += ms;
  };
  /** Downloads, and waits until the model is all there or stopped. */
  const downloaded = async () => {
    await local.download();
    await vi.waitFor(async () => {
      expect(['ready', 'paused', 'damaged']).toContain((await local.state()).phase.kind);
    });
  };
  return { ...fake, store, engine, local, catalog, heard, kinds, tick, downloaded };
}

describe('localModel', () => {
  it('has nothing until the user asks, and picks the model that suits the computer', async () => {
    const t = setup();
    await expect(t.local.state()).resolves.toEqual({
      model: CATALOG.standard,
      phase: { kind: 'none' },
      smaller: true,
    });
    await expect(setup({ memoryGb: 4 }).local.state()).resolves.toMatchObject({
      model: CATALOG.small,
      smaller: false,
    });
    expect(server).not.toHaveBeenCalled();
  });

  it('downloads on request, keeps the choice, and says it is ready', async () => {
    const t = setup();
    await t.downloaded();
    expect(t.kinds()).toEqual(['downloading', 'ready']);
    expect(t.stored.get('builtIn')).toEqual({ model: 'std', name: 'STD', ready: true });
    await expect(t.local.used()).resolves.toBe(100);
    await expect(t.local.state()).resolves.toMatchObject({ phase: { kind: 'ready' } });
  });

  it('starts one download at a time, and passes progress on at most once a second', async () => {
    let send: (() => void) | undefined;
    // Ten bytes each time the test says, until the download is stopped.
    const slow = vi.fn<typeof fetch>((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start: (controller) => {
              init?.signal?.addEventListener('abort', () => {
                controller.error(new DOMException('Stopped.', 'AbortError'));
              });
              send = () => {
                controller.enqueue(STANDARD.slice(0, 10));
              };
            },
          }),
        ),
      ),
    );
    const t = setup({ fetch: slow });
    await Promise.all([t.local.download(), t.local.download()]);
    await vi.waitFor(() => {
      expect(send).toBeDefined();
    });
    expect(slow).toHaveBeenCalledOnce();
    send?.();
    t.tick(1000);
    await vi.waitFor(() => {
      expect(t.heard.at(-1)?.phase).toEqual({ kind: 'downloading', done: 10 });
    });
    send?.();
    await vi.waitFor(() => {
      expect(t.heard).toHaveLength(2);
    });
    t.tick(999);
    send?.();
    await expect(t.local.state()).resolves.toMatchObject({
      phase: { kind: 'downloading', done: 10 },
    });
    // Progress no listener could hear is left for the next.
    t.catalog.mockRejectedValueOnce(new Error('gone'));
    const asked = t.catalog.mock.calls.length;
    t.tick(1);
    send?.();
    await vi.waitFor(() => {
      expect(t.catalog.mock.calls.length).toBeGreaterThan(asked);
    });
    t.tick(1000);
    send?.();
    await vi.waitFor(() => {
      expect(t.heard.at(-1)?.phase).toEqual({ kind: 'downloading', done: 50 });
    });
    await t.local.remove();
    expect(t.kinds().at(-1)).toBe('none');
  });

  it('pauses after a restart, and resumes where the download stopped', async () => {
    const t = setup();
    await t.store.save(CATALOG.standard.sha256, 0, [STANDARD.slice(0, 40)]);
    await expect(t.local.state()).resolves.toMatchObject({
      phase: { kind: 'paused', done: 40, problem: '' },
    });
    await t.downloaded();
    expect(t.heard[0]?.phase).toEqual({ kind: 'downloading', done: 40 });
    expect(server).toHaveBeenLastCalledWith(
      CATALOG.standard.url,
      expect.objectContaining({
        headers: { Range: 'bytes=40-' },
      }),
    );
  });

  it('says why a download stopped: the connection, the disk, or a damaged file', async () => {
    const offline = setup({
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')),
    });
    await offline.downloaded();
    expect(offline.heard.at(-1)?.phase).toEqual({
      kind: 'paused',
      done: 0,
      problem: 'download-failed',
    });
    const damaged = setup({
      fetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response(fileOf(9)))),
    });
    await damaged.downloaded();
    expect(damaged.heard.at(-1)?.phase).toEqual({ kind: 'damaged' });
    const full = setup();
    vi.spyOn(full.store, 'free').mockResolvedValue(10);
    await full.downloaded();
    expect(full.heard.at(-1)?.phase).toEqual({ kind: 'paused', done: 0, problem: 'disk-full' });
  });

  it('ends a download that failed before it began, even when nobody can be told', async () => {
    const t = setup();
    t.catalog.mockRejectedValueOnce(new Error('gone')).mockRejectedValueOnce(new Error('gone'));
    await t.local.download();
    expect(t.heard).toEqual([]);
    await t.downloaded();
    expect(t.kinds()).toEqual(['downloading', 'ready']);
  });

  it('carries on when its choice cannot be kept, reading it again next time', async () => {
    const t = setup();
    t.host.storage.get.mockRejectedValueOnce(new Error('gone'));
    await expect(t.local.state()).rejects.toThrow('gone');
    await expect(t.local.state()).resolves.toMatchObject({ phase: { kind: 'none' } });
    t.host.storage.set.mockRejectedValueOnce(new Error('full'));
    await t.local.download();
    await vi.waitFor(() => {
      expect(t.kinds()).toEqual(['none']);
    });
  });

  it('loads the model once on first use, warming up, and answers through the provider', async () => {
    const t = setup();
    await t.downloaded();
    const provider = t.local.provider();
    const request = { instructions: 'Be brief', turns: [{ role: 'user', text: 'Hello' }] } as const;
    await Promise.all([
      provider.complete(request, () => undefined),
      provider.complete(request, () => undefined),
    ]);
    expect(t.engine.load).toHaveBeenCalledOnce();
    const [model] = t.engine.load.mock.calls[0] as [Blob];
    expect(new Uint8Array(await model.arrayBuffer())).toEqual(STANDARD);
    expect(t.kinds().slice(-2)).toEqual(['warming', 'ready']);
    expect(t.engine.chat).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'Be brief' },
        { role: 'user', content: 'Hello' },
      ],
      expect.any(Function),
      undefined,
    );
  });

  it('says when the model does not fit in memory, tries again next time, and swaps for the smaller one', async () => {
    const t = setup();
    await t.downloaded();
    t.engine.load.mockRejectedValueOnce(new Error('Aborted(OOM)'));
    const provider = t.local.provider();
    const request = { instructions: '', turns: [] };
    await expect(provider.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('out-of-memory'),
    );
    await expect(t.local.state()).resolves.toMatchObject({ phase: { kind: 'out-of-memory' } });
    t.engine.load.mockRejectedValueOnce(new Error('bad magic'));
    await expect(provider.complete(request, () => undefined)).rejects.toEqual(
      new ProviderError('failed'),
    );
    await expect(t.local.state()).resolves.toMatchObject({ phase: { kind: 'ready' } });
    await t.local.smaller();
    await vi.waitFor(async () => {
      expect((await t.local.state()).phase.kind).toBe('ready');
    });
    expect(t.engine.unload).toHaveBeenCalled();
    expect(t.stored.get('builtIn')).toEqual({ model: 'sml', name: 'SML', ready: true });
    await expect(t.store.pieces(CATALOG.standard.sha256)).resolves.toEqual([]);
    await expect(t.local.state()).resolves.toMatchObject({ model: CATALOG.small, smaller: false });
  });

  it('removes every model and forgets the choice', async () => {
    const t = setup();
    await t.downloaded();
    await t.local.remove();
    expect(t.stored.has('builtIn')).toBe(false);
    await expect(t.local.used()).resolves.toBe(0);
    await expect(t.local.state()).resolves.toMatchObject({ phase: { kind: 'none' } });
    expect(t.kinds().at(-1)).toBe('none');
  });
});
