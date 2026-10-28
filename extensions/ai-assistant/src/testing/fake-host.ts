import type { ActiveChat, ExtensionHost, SettingValue } from '@yapyap/extension-sdk';
import { vi, type Mock } from 'vitest';

interface Store<T> {
  readonly get: Mock<(key: string) => Promise<T | undefined>>;
  readonly set: Mock<(key: string, value: T) => Promise<void>>;
  readonly delete: Mock<(key: string) => Promise<void>>;
}

/** A key-value API kept in `entries`. */
function memory<T>(entries: Map<string, T>): Store<T> {
  return {
    get: vi.fn((key: string) => Promise.resolve(entries.get(key))),
    set: vi.fn((key: string, value: T) => {
      entries.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      entries.delete(key);
      return Promise.resolve();
    }),
  };
}

export interface FakeHost {
  readonly host: {
    readonly settings: {
      readonly get: Mock<() => Promise<Readonly<Record<string, SettingValue>>>>;
    };
    readonly secrets: Store<string>;
    readonly chat: {
      readonly readActive: Mock<() => Promise<ActiveChat | null>>;
      readonly readUnreadSummary: Mock<ExtensionHost['chat']['readUnreadSummary']>;
    };
    readonly composer: {
      readonly insertDraft: Mock<(text: string) => Promise<void>>;
      readonly replaceDraft: Mock<(text: string) => Promise<void>>;
      readonly readDraft: Mock<() => Promise<string | null>>;
    };
    readonly storage: Store<unknown>;
  };
  readonly secrets: Map<string, string>;
  readonly stored: Map<string, unknown>;
  readonly drafts: string[];
}

/** An extension host with the parts the assistant uses, kept in memory, for tests. */
export function fakeHost(
  options: {
    readonly settings?: Readonly<Record<string, SettingValue>>;
    readonly chat?: ActiveChat | null;
  } = {},
): FakeHost {
  const secrets = new Map<string, string>();
  const stored = new Map<string, unknown>();
  const drafts: string[] = [];
  const host = {
    settings: { get: vi.fn(() => Promise.resolve(options.settings ?? {})) },
    secrets: memory(secrets),
    chat: {
      readActive: vi.fn(() => Promise.resolve(options.chat ?? null)),
      readUnreadSummary: vi.fn(),
    },
    composer: {
      insertDraft: vi.fn((text: string) => {
        drafts.push(text);
        return Promise.resolve();
      }),
      replaceDraft: vi.fn(),
      readDraft: vi.fn(),
    },
    storage: memory(stored),
  };
  return { host, secrets, stored, drafts };
}
