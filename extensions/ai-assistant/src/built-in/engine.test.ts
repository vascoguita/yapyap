import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineError, failureOf, wllamaEngine } from './engine.ts';

/** wllama as the tests play it: what it was made with, and what it streams. */
const played = vi.hoisted(() => ({
  made: [] as { paths: unknown; config: unknown; compat: unknown[]; load?: unknown }[],
  chunks: [] as unknown[],
  loadError: undefined as Error | undefined,
  exits: 0,
  exitFails: false,
  asked: [] as unknown[],
}));

vi.mock('@wllama/wllama/esm/index.js', () => {
  class WllamaAbortError extends Error {}
  class Wllama {
    readonly record: (typeof played.made)[number];

    constructor(paths: unknown, config: unknown) {
      this.record = { paths, config, compat: [] };
      played.made.push(this.record);
    }

    setCompat(compat: unknown) {
      this.record.compat.push(compat);
    }

    loadModel(files: unknown, params: unknown) {
      this.record.load = { files, params };
      return played.loadError === undefined ? Promise.resolve() : Promise.reject(played.loadError);
    }

    createChatCompletion(options: { onData: (chunk: unknown) => void }) {
      played.asked.push(options);
      for (const chunk of played.chunks) {
        options.onData(chunk);
      }
      return Promise.resolve();
    }

    exit() {
      played.exits += 1;
      return played.exitFails ? Promise.reject(new Error('gone')) : Promise.resolve();
    }
  }
  return { Wllama, WllamaAbortError };
});

const { WllamaAbortError } = await import('@wllama/wllama/esm/index.js');

beforeEach(() => {
  played.made.length = 0;
  played.chunks = [];
  played.loadError = undefined;
  played.exits = 0;
  played.exitFails = false;
  played.asked.length = 0;
});

const chunk = (content: string | undefined, finish: string | null = null) => ({
  choices: [{ delta: content === undefined ? {} : { content }, finish_reason: finish }],
});

const MODEL = new Blob(['gguf']);

describe('wllamaEngine', () => {
  it('loads the model with the extension’s own wasm, no CDN, on the CPU without a GPU', async () => {
    const engine = wllamaEngine({
      wasm: 'extension://x/wllama.wasm',
      hasGpu: () => Promise.resolve(false),
    });
    await engine.load(MODEL);
    const [made] = played.made;
    expect(made?.paths).toEqual({ default: 'extension://x/wllama.wasm' });
    expect(made?.compat).toEqual([null]);
    expect(made?.config).toMatchObject({ suppressNativeLog: true });
    expect(made?.load).toEqual({ files: [MODEL], params: { n_ctx: 4096, n_gpu_layers: 0 } });
    // Nothing reaches the console, where a line could quote a chat.
    const { logger } = made?.config as { logger: Record<string, () => unknown> };
    expect(Object.values(logger).map((log) => log())).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    const gpu = wllamaEngine({ wasm: 'w', hasGpu: () => Promise.resolve(true) });
    await gpu.load(MODEL);
    expect(played.made[1]?.load).toEqual({ files: [MODEL], params: { n_ctx: 4096 } });
  });

  it('streams the reply piece by piece, and says when it stopped at its length', async () => {
    const engine = wllamaEngine({ wasm: 'w', hasGpu: () => Promise.resolve(false) });
    await expect(engine.chat([], () => undefined)).rejects.toThrow(EngineError);
    await engine.load(MODEL);
    played.chunks = [chunk('Hi'), chunk(undefined), chunk(' there', 'length'), { choices: [] }];
    const pieces: string[] = [];
    const signal = new AbortController().signal;
    const turns = [{ role: 'user', content: 'Hello' }] as const;
    await expect(engine.chat(turns, (piece) => pieces.push(piece), signal)).resolves.toEqual({
      text: 'Hi there',
      truncated: true,
    });
    expect(pieces).toEqual(['Hi', ' there']);
    expect(played.asked[0]).toMatchObject({
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 512,
      stream: true,
      abortSignal: signal,
    });
    played.chunks = [chunk('Done', 'stop')];
    await expect(engine.chat(turns, () => undefined)).resolves.toEqual({
      text: 'Done',
      truncated: false,
    });
    expect(played.asked[1]).not.toHaveProperty('abortSignal');
  });

  it('frees what a failed load left, and unloads on request', async () => {
    const engine = wllamaEngine({ wasm: 'w', hasGpu: () => Promise.resolve(false) });
    await engine.unload();
    expect(played.exits).toBe(0);
    played.loadError = new Error('Cannot allocate WebAssembly.Memory');
    played.exitFails = true;
    await expect(engine.load(MODEL)).rejects.toThrow('Cannot allocate');
    expect(played.exits).toBe(1);
    played.exitFails = false;
    played.loadError = undefined;
    await engine.load(MODEL);
    await engine.unload();
    expect(played.exits).toBe(2);
    await expect(engine.chat([], () => undefined)).rejects.toThrow(EngineError);
  });
});

describe('failureOf', () => {
  it('tells running out of memory and stopping apart from other failures', () => {
    expect(failureOf(new EngineError('cancelled'))).toBe('cancelled');
    expect(failureOf(new WllamaAbortError())).toBe('cancelled');
    expect(failureOf(new Error('Aborted(OOM)'))).toBe('out-of-memory');
    expect(failureOf(new RangeError('WebAssembly.Memory(): could not allocate memory'))).toBe(
      'out-of-memory',
    );
    expect(failureOf(new Error('bad magic'))).toBe('failed');
    expect(failureOf('memory')).toBe('failed');
    expect(new EngineError('failed').message).toBe('The model on this computer failed: failed.');
  });
});
