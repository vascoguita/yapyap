import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../settings/schema.ts';
import {
  barAccounts,
  createAssistantChrome,
  clock,
  later,
  type AssistantAccounts,
  type AssistantChromeDependencies,
} from './assistant-chrome.ts';

const SETTINGS = {
  assistant: {
    enabled: true,
    provider: 'none',
    model: 'auto',
    autoSuggest: true,
    summaries: true,
    chats: 'chosen',
    messages: '50',
    server: '',
  },
} as unknown as Settings;

const ACCOUNTS: AssistantAccounts = {
  entries: [
    { id: 'a', name: 'Home', active: false },
    { id: 'b', name: 'Work', active: true },
  ],
  readActiveChat: vi.fn(() => Promise.resolve(null)),
  readDraft: vi.fn(() => Promise.resolve('draft')),
  replaceDraft: vi.fn(() => Promise.resolve(true)),
};

function harness(open: AssistantAccounts | undefined = ACCOUNTS) {
  let settings = SETTINGS;
  const accounts = open;
  const settingsListeners: (() => void)[] = [];
  const deps: AssistantChromeDependencies = {
    sources: {
      fetch: vi.fn(),
      chats: {
        isAllowed: () => false,
        allow: vi.fn(() => Promise.resolve()),
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
      findServers: () => Promise.resolve([]),
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
    accounts: () => accounts,
    openSettings: vi.fn(),
    warn: vi.fn(),
  };
  const chrome = createAssistantChrome(deps);
  return {
    chrome,
    deps,
    setEnabled: (enabled: boolean) => {
      settings = { ...settings, assistant: { ...settings.assistant, enabled } };
    },
    /** Saves a key from Settings, which changes the setup the bar shows. */
    keyChanged: () => {
      const save = chrome.handlers.find(({ channel }) => channel === 'assistant:save-key');
      return save?.handle({ sender: {} }, 'openai', 'sk');
    },
    settingsChanged: () => {
      for (const run of settingsListeners) {
        run();
      }
    },
  };
}

describe('createAssistantChrome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the assistant once it has a view, as the settings change, and names the model', async () => {
    const t = harness();
    const view = { show: vi.fn(), publish: vi.fn() };
    t.chrome.attachBar(() => view);
    await vi.waitFor(() => {
      expect(view.publish).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: 'not set up yet', notice: null }),
      );
    });
    expect(view.show).toHaveBeenCalledWith(true);
    t.settingsChanged();
    t.chrome.refreshBar();
    await vi.waitFor(() => {
      expect(view.show).toHaveBeenCalledTimes(3);
    });
  });

  it('serves Settings › Assistant, which tells the bar when the setup changes', async () => {
    const t = harness();
    const channels = t.chrome.handlers.map(({ channel }) => channel);
    expect(channels).toContain('assistant:view');
    const view = { show: vi.fn(), publish: vi.fn() };
    t.chrome.attachBar(() => view);
    await t.keyChanged();
    await vi.waitFor(() => {
      expect(view.show).toHaveBeenCalledTimes(2);
    });
    const viewHandler = t.chrome.handlers.find(({ channel }) => channel === 'assistant:view');
    await expect(viewHandler?.handle({ sender: {} })).resolves.toMatchObject({ inUse: null });
  });

  it('acts before the assistant has a view or there are accounts', async () => {
    const t = harness(undefined);
    const viewHandler = t.chrome.handlers.find(({ channel }) => channel === 'assistant:view');
    await expect(viewHandler?.handle({ sender: {} })).resolves.toMatchObject({ chats: [] });
    t.chrome.refreshBar();
    await vi.waitFor(() => {
      expect(t.deps.warn).not.toHaveBeenCalled();
    });
  });

  it('lets the assistant work in the chat open on screen, from Settings', async () => {
    const allowOpen = (t: ReturnType<typeof harness>) =>
      t.chrome.handlers
        .find(({ channel }) => channel === 'assistant:allow-open-chat')
        ?.handle({ sender: {} });
    const none = harness();
    await expect(allowOpen(none)).resolves.toBe(false);
    const nobody = harness({ ...ACCOUNTS, entries: [] });
    await expect(allowOpen(nobody)).resolves.toBe(false);
    expect(nobody.deps.sources.chats.allow).not.toHaveBeenCalled();
    const chat = { name: 'Ana', group: false, messages: [] };
    const open = harness({ ...ACCOUNTS, readActiveChat: () => Promise.resolve(chat) });
    await expect(allowOpen(open)).resolves.toBe(true);
    expect(open.deps.sources.chats.allow).toHaveBeenCalledExactlyOnceWith('b', 'Ana');
  });

  it('says when the bar cannot show the setup', async () => {
    const t = harness();
    Object.assign(t.deps.sources.keys, { get: () => Promise.reject(new Error('locked')) });
    t.chrome.refreshBar();
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledWith('The assistant bar could not show the setup.');
    });
    await t.keyChanged();
    await vi.waitFor(() => {
      expect(vi.mocked(t.deps.warn).mock.calls.length).toBeGreaterThanOrEqual(2);
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
    expect(await open.readDraft()).toBe('draft');
    expect(await open.replaceDraft('x')).toBe(true);
    const none = barAccounts(() => undefined);
    expect(none.active()).toBe('');
    expect(await none.readActiveChat(5)).toBeNull();
    expect(await none.readDraft()).toBeNull();
    expect(await none.replaceDraft('x')).toBe(false);
    const nobody = barAccounts(() => ({ ...ACCOUNTS, entries: [] }));
    expect(nobody.active()).toBe('');
  });
});

describe('clock', () => {
  it('tells the time now', () => {
    const before = Date.now();
    const now = clock().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
