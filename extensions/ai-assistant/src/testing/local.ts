import { vi } from 'vitest';
import type { BuiltInModel } from '../built-in/catalog.ts';
import type { LocalModel, LocalState, Phase } from '../built-in/local-model.ts';
import type { Provider } from '../providers/provider.ts';

/** The private model in tests: 1.1 GB, as the usual one is. */
export const QWEN: BuiltInModel = {
  id: 'qwen',
  name: 'Qwen2.5 1.5B',
  url: 'https://huggingface.co/qwen.gguf',
  size: 1_117_320_736,
  sha256: 'a'.repeat(64),
};

/** A private model whose state a test sets, and whose listeners it calls. */
export interface FakeLocal {
  readonly local: {
    readonly [K in keyof LocalModel]: LocalModel[K] & ReturnType<typeof vi.fn>;
  };
  /** Sets where the model stands, as `state()` reports it. */
  readonly set: (phase: Phase, smaller?: boolean) => void;
  /** Calls every listener with `phase`, as the model does when it changes. */
  readonly tell: (phase: Phase, smaller?: boolean) => void;
  readonly used: { bytes: number };
}

export function fakeLocal(provider: Provider = { complete: vi.fn() }): FakeLocal {
  let state: LocalState = { model: QWEN, phase: { kind: 'none' }, smaller: true };
  const listeners: ((state: LocalState) => void)[] = [];
  const used = { bytes: 0 };
  const set = (phase: Phase, smaller = true): void => {
    state = { model: QWEN, phase, smaller };
  };
  const local = {
    state: vi.fn(() => Promise.resolve(state)),
    used: vi.fn(() => Promise.resolve(used.bytes)),
    download: vi.fn(() => {
      set({ kind: 'downloading', done: 0 });
      return Promise.resolve();
    }),
    smaller: vi.fn(() => {
      set({ kind: 'downloading', done: 0 }, false);
      return Promise.resolve();
    }),
    remove: vi.fn(() => Promise.resolve()),
    provider: vi.fn(() => provider),
    onChange: vi.fn((listener: (state: LocalState) => void) => {
      listeners.push(listener);
    }),
  };
  const tell = (phase: Phase, smaller = true): void => {
    set(phase, smaller);
    for (const listener of listeners) {
      listener(state);
    }
  };
  return { local, set, tell, used };
}
