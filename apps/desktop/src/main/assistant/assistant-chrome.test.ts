import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../settings/schema.ts';
import {
  barAccounts,
  createAssistantChrome,
  later,
  type AssistantAccounts,
  type AssistantChromeDependencies,
} from './assistant-chrome.ts';
import { CATALOG } from './private/catalog.ts';
import type { ModelFiles } from './private/files.ts';

const SETTINGS = {
  assistant: {
    enabled: true,
    provider: 'auto',
    model: 'auto',
    autoSuggest: true,
    messages: '10',
    localServer: '',
  },
} as unknown as Settings;

const ACCOUNTS: AssistantAccounts = {
  entries: [
    { id: 'a', name: 'Home', active: false },
    { id: 'b', name: 'Work', active: true },
  ],
  readActiveChat: vi.fn(() => Promise.resolve(null)),
  readUnreadSummary: vi.fn(() => Promise.resolve([])),
  readDraft: vi.fn(() => Promise.resolve('draft')),
  replaceDraft: vi.fn(() => Promise.resolve(true)),
  pressEnter: vi.fn(() => Promise.resolve(true)),
};

function files(): ModelFiles {
  return {
    path: () => '/models/m.gguf',
    saved: () => Promise.resolve(0),
    read: async function* () {
      yield* [] as Uint8Array[];
      await Promise.resolve();
    },
    append: vi.fn(),
    finish: vi.fn(),
    discard: vi.fn(),
    clear: vi.fn(() => Promise.resolve()),
    used: () => Promise.resolve(0),
    free: () => Promise.resolve(undefined),
  };
}

function harness(open = true) {
  let settings = SETTINGS;
  const accounts = open ? ACCOUNTS : undefined;
  const settingsListeners: (() => void)[] = [];
  let hear: ((sender: object, url: string, payload: unknown) => void) | undefined;
  const deps: AssistantChromeDependencies = {
    sources: {
      fetch: vi.fn(),
      catalog: CATALOG,
      hardware: () => ({ memory: 16 * 1024 ** 3, cores: 8 }),
      files: files(),
      state: {
        privateModel: () => undefined,
        setPrivateModel: vi.fn(),
      },
      chats: {
        isAllowed: () => false,
        allow: vi.fn(),
        forget: vi.fn(),
        forgetAccount: vi.fn(),
        list: () => Promise.resolve([]),
      },
      keys: {
        get: () => Promise.resolve(undefined),
        save: vi.fn(),
        forget: vi.fn(),
        canKeep: () => Promise.resolve(true),
      },
      languages: ['en'],
      findServers: () => Promise.resolve([]),
      listenToEngine: (listener) => {
        hear = listener;
      },
      now: () => 0,
    },
    settings: {
      current: () => settings,
      notice: undefined,
      firstRun: false,
      update: vi.fn(),
      onChange: (listener) => {
        settingsListeners.push(listener as () => void);
      },
    },
    openEngine: vi.fn(),
    accounts: () => accounts,
    openSettings: vi.fn(),
    writeClipboard: vi.fn(),
    notify: vi.fn(),
    warn: vi.fn(),
  };
  const chrome = createAssistantChrome(deps);
  return {
    chrome,
    deps,
    setEnabled: (enabled: boolean) => {
      settings = { ...settings, assistant: { ...settings.assistant, enabled } };
    },
    modelsChanged: () => {
      const remove = chrome.handlers.find(({ channel }) => channel === 'assistant:private-model');
      void remove?.handle({ sender: {} }, 'remove');
    },
    settingsChanged: () => {
      for (const run of settingsListeners) {
        run();
      }
    },
    hear: () => hear,
  };
}

describe('createAssistantChrome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the bar once it has a view, as the settings change, and says what is missing', async () => {
    const t = harness();
    const view = { show: vi.fn(), publish: vi.fn(), onPage: vi.fn(() => Promise.resolve(true)) };
    t.chrome.attachBar(() => view);
    await vi.waitFor(() => {
      expect(view.publish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'Set up the assistant to start: choose where it thinks.',
        }),
      );
    });
    expect(view.show).toHaveBeenCalledWith(true);
    t.settingsChanged();
    t.chrome.refreshBar();
    await vi.waitFor(() => {
      expect(view.show).toHaveBeenCalledTimes(3);
    });
    expect(t.chrome.modelFile()).toBeUndefined();
    expect(t.hear()).toBeTypeOf('function');
  });

  it('serves Settings › Assistant, which tells the bar when the setup changes', async () => {
    const t = harness();
    const channels = t.chrome.handlers.map(({ channel }) => channel);
    expect(channels).toContain('assistant:view');
    const view = { show: vi.fn(), publish: vi.fn(), onPage: vi.fn(() => Promise.resolve(true)) };
    t.chrome.attachBar(() => view);
    const remove = t.chrome.handlers.find(({ channel }) => channel === 'assistant:private-model');
    await remove?.handle({ sender: {} }, 'remove');
    await vi.waitFor(() => {
      expect(view.show).toHaveBeenCalledTimes(2);
    });
    const viewHandler = t.chrome.handlers.find(({ channel }) => channel === 'assistant:view');
    await expect(viewHandler?.handle({ sender: {} })).resolves.toMatchObject({ inUse: null });
  });

  it('acts before the bar has a view or there are accounts, which then shows nothing', async () => {
    const t = harness(false);
    const viewHandler = t.chrome.handlers.find(({ channel }) => channel === 'assistant:view');
    await expect(viewHandler?.handle({ sender: {} })).resolves.toMatchObject({ chats: [] });
    await t.chrome.actions.suggest();
    await t.chrome.actions.catchUp();
    expect(t.deps.notify).toHaveBeenCalledWith(
      'Open any chat to use the assistant: it sits right above the message box.',
    );
  });

  it('runs a menu action in the bar only where it shows, and says what to do otherwise', async () => {
    const t = harness();
    const view = { show: vi.fn(), publish: vi.fn(), onPage: vi.fn(() => Promise.resolve(false)) };
    t.chrome.attachBar(() => view);
    await t.chrome.actions.summarize();
    expect(t.deps.notify).toHaveBeenLastCalledWith(
      'Open any chat to use the assistant: it sits right above the message box.',
    );
    view.onPage.mockResolvedValue(true);
    view.publish.mockClear();
    await t.chrome.actions.catchUp();
    expect(view.publish).toHaveBeenCalled();
    expect(t.deps.notify).toHaveBeenCalledOnce();
    t.setEnabled(false);
    await t.chrome.actions.suggest();
    expect(t.deps.notify).toHaveBeenLastCalledWith(
      'The assistant is off. Turn it on in Settings, under Assistant.',
    );
  });

  it('says when the bar cannot show the setup', async () => {
    const t = harness();
    Object.assign(t.deps.sources.keys, { get: () => Promise.reject(new Error('locked')) });
    t.chrome.refreshBar();
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledWith('The assistant bar could not show the setup.');
    });
    t.modelsChanged();
    await vi.waitFor(() => {
      expect(vi.mocked(t.deps.warn).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('later', () => {
  it('runs after a while, unless called off', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    later(1000, run);
    const cancel = later(1000, run);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('barAccounts', () => {
  it('reaches the account on screen, and nothing before there are accounts', async () => {
    const open = barAccounts(() => ACCOUNTS);
    expect(open.active()).toBe('b');
    expect(await open.readActiveChat(5)).toBeNull();
    expect(ACCOUNTS.readActiveChat).toHaveBeenCalledWith(5);
    expect(await open.readUnreadSummary()).toEqual([]);
    expect(await open.readDraft()).toBe('draft');
    expect(await open.replaceDraft('x')).toBe(true);
    expect(await open.pressEnter()).toBe(true);
    const none = barAccounts(() => undefined);
    expect(none.active()).toBe('');
    expect(await none.readActiveChat(5)).toBeNull();
    expect(await none.readUnreadSummary()).toEqual([]);
    expect(await none.readDraft()).toBeNull();
    expect(await none.replaceDraft('x')).toBe(false);
    expect(await none.pressEnter()).toBe(false);
    const nobody = barAccounts(() => ({ ...ACCOUNTS, entries: [] }));
    expect(nobody.active()).toBe('');
  });
});
