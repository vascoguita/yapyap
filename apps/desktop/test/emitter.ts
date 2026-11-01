import { vi, type Mock } from 'vitest';

type Listener = (...args: never[]) => void;

type Listen = (event: string, listener: Listener) => void;

export interface FakeEmitter {
  readonly on: Mock<Listen>;
  readonly once: Mock<Listen>;
  /** Runs every listener for `event` with `args`. */
  readonly fire: (event: string, ...args: unknown[]) => void;
}

/**
 * An event source like an Electron object's: every listener for an event
 * runs, in the order it was added. `on` and `once` are spies, so a test can
 * also check what was listened to. A `once` listener stays, which tests that
 * fire an event twice rely on.
 */
export function fakeEmitter(): FakeEmitter {
  const listeners = new Map<string, Listener[]>();
  const listen: Listen = (event, listener) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };
  return {
    on: vi.fn(listen),
    once: vi.fn(listen),
    fire: (event: string, ...args: unknown[]): void => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...(args as never[]));
      }
    },
  };
}
