import { describe, expect, it, vi } from 'vitest';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { chatId } from './chats.ts';
import { assistantHandlers, type AssistantSettingsDependencies } from './settings-handlers.ts';
import type { Setup } from './setup.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';

const READY: Setup = {
  provider: 'anthropic',
  missing: '',
  models: [{ id: 'claude-haiku', label: 'Haiku' }],
  auto: { id: 'claude-haiku', label: 'Haiku' },
  model: 'claude-haiku',
  key: 'sk',
  endpoint: '',
};

const SERVER = 'https://models.example/v1';

function harness() {
  let setup = READY;
  const kept = new Map<string, string>([['anthropic', 'sk']]);
  const deps: AssistantSettingsDependencies = {
    core: { setup: () => Promise.resolve(setup) },
    keys: {
      get: (provider) => Promise.resolve(kept.get(provider)),
      save: vi.fn((provider: string, key: string) => {
        kept.set(provider, key);
        return Promise.resolve(true);
      }),
      forget: vi.fn((provider: string) => {
        kept.delete(provider);
        return Promise.resolve();
      }),
      canKeep: () => Promise.resolve(true),
    },
    settings: { current: () => ({ assistant: { server: SERVER } }) as never },
    chats: {
      list: () =>
        Promise.resolve([
          {
            account: ACCOUNT,
            chats: [
              { id: chatId('Ana'), name: 'Ana' },
              { id: chatId('Bo'), name: undefined },
            ],
          },
          { account: 'gone', chats: [{ id: chatId('Cy'), name: 'Cy' }] },
          { account: 'empty', chats: [] },
        ]),
      forget: vi.fn(),
      allow: vi.fn(() => Promise.resolve()),
    },
    openChat: vi.fn(() =>
      Promise.resolve<{ account: string; name: string } | null>({ account: ACCOUNT, name: 'Di' }),
    ),
    accounts: () => [
      { id: ACCOUNT, name: 'Home' },
      { id: 'empty', name: 'Work' },
    ],
    findServers: vi.fn(() =>
      Promise.resolve([
        { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['m'] },
      ]),
    ),
    fetch: vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
    changed: vi.fn(),
  };
  const handlers = assistantHandlers(deps);
  const handler = (channel: string): ChromeHandler => {
    const found = handlers.find((entry) => entry.channel === channel);
    if (found === undefined) {
      throw new Error(`No ${channel}.`);
    }
    return found;
  };
  const call = (channel: string, ...args: unknown[]) => {
    const found = handler(`assistant:${channel}`);
    expect(found.accepts(args)).toBe(true);
    return found.handle({ sender: {} }, ...args);
  };
  return {
    deps,
    handler,
    call,
    setSetup: (next: Setup) => {
      setup = next;
    },
  };
}

describe('assistantHandlers', () => {
  it('shows who answers, which keys are saved, the models and the chats it may read', async () => {
    const t = harness();
    expect(await t.call('view')).toEqual({
      inUse: 'anthropic',
      status: '',
      keys: { anthropic: true, openai: false, server: false },
      models: READY.models,
      auto: { id: 'claude-haiku', label: 'Haiku' },
      chats: [
        {
          account: ACCOUNT,
          accountName: 'Home',
          chats: [
            { id: chatId('Ana'), name: 'Ana' },
            { id: chatId('Bo'), name: null },
          ],
        },
      ],
    });
    t.setSetup({ ...READY, provider: undefined, missing: 'setup', models: [], auto: undefined });
    expect(await t.call('view')).toMatchObject({
      inUse: null,
      status: 'Set up the assistant to start: choose a provider.',
      auto: null,
    });
    t.setSetup({ ...READY, missing: 'off' });
    expect(await t.call('view')).toMatchObject({ status: '' });
  });

  it('keeps and forgets keys, and tells the bar', async () => {
    const t = harness();
    expect(await t.call('save-key', 'openai', '  sk-new \n')).toBe(true);
    expect(t.deps.keys.save).toHaveBeenCalledWith('openai', 'sk-new');
    await t.call('forget-key', 'anthropic');
    expect(t.deps.keys.forget).toHaveBeenCalledWith('anthropic');
    expect(t.deps.changed).toHaveBeenCalledTimes(2);
    const save = t.handler('assistant:save-key');
    for (const args of [
      ['claude', 'sk'],
      ['openai', '  '],
      ['openai', 'sk', 'x'],
      ['openai', 7],
    ]) {
      expect(save.accepts(args)).toBe(false);
    }
    expect(t.handler('assistant:forget-key').accepts(['openai', 1])).toBe(false);
  });

  it('tests a saved key by asking the provider for its models', async () => {
    const t = harness();
    expect(await t.call('test-key', 'anthropic')).toBe('');
    expect(await t.call('test-key', 'openai')).toBe('OpenAI did not accept your key.');
    expect(t.handler('assistant:test-key').accepts(['local'])).toBe(false);
  });

  it('keeps a model server’s key, and tests it at the server’s own address', async () => {
    const t = harness();
    expect(await t.call('save-key', 'server', 'sk-cloud')).toBe(true);
    expect(await t.call('view')).toMatchObject({ keys: { server: true } });
    vi.mocked(t.deps.fetch).mockClear();
    expect(await t.call('test-key', 'server')).toBe('');
    expect(vi.mocked(t.deps.fetch).mock.calls[0]?.[0]).toBe(`${SERVER}/models`);
  });

  it('finds model servers, and forgets a chat by its fingerprint alone', async () => {
    const t = harness();
    expect(await t.call('find-servers')).toEqual([
      { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['m'] },
    ]);
    await t.call('forget-chat', ACCOUNT, chatId('Ana'));
    expect(t.deps.chats.forget).toHaveBeenCalledWith(ACCOUNT, chatId('Ana'));
    const forget = t.handler('assistant:forget-chat');
    for (const args of [
      [ACCOUNT, 'Ana'],
      [1, chatId('Ana')],
      [ACCOUNT, chatId('Ana'), 'x'],
    ]) {
      expect(forget.accepts(args)).toBe(false);
    }
  });

  it('lets the assistant work in the chat open on screen, and says when none is open', async () => {
    const t = harness();
    expect(t.handler('assistant:allow-open-chat').accepts(['Ana'])).toBe(false);
    expect(await t.call('allow-open-chat')).toBe(true);
    expect(t.deps.chats.allow).toHaveBeenCalledExactlyOnceWith(ACCOUNT, 'Di');
    vi.mocked(t.deps.openChat).mockResolvedValueOnce(null);
    expect(await t.call('allow-open-chat')).toBe(false);
    expect(t.deps.chats.allow).toHaveBeenCalledOnce();
  });
});
