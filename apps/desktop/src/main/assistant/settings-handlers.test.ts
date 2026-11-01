import { describe, expect, it, vi } from 'vitest';
import type { ChromeHandler } from '../ipc/chrome.ts';
import { chatId } from './chats.ts';
import type { PrivateModelStatus } from './private/private-model.ts';
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

const MODEL: PrivateModelStatus = {
  model: { id: 'q', name: 'Q', url: 'https://huggingface.co/q', size: 1_117_320_736, sha256: 'a' },
  phase: { kind: 'none' },
  smaller: true,
  used: 0,
};

function harness() {
  let setup = READY;
  let model = MODEL;
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
    privateModels: {
      status: () => Promise.resolve(model),
      ready: vi.fn(),
      file: vi.fn(),
      download: vi.fn(),
      pause: vi.fn(),
      smaller: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
      outOfMemory: vi.fn(),
      onChange: vi.fn(),
    },
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
    },
    accounts: () => [
      { id: ACCOUNT, name: 'Home' },
      { id: 'empty', name: 'Work' },
    ],
    findServers: vi.fn(() =>
      Promise.resolve([
        { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1', models: ['m'] },
      ]),
    ),
    fetch: vi.fn(() =>
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
    setModel: (next: PrivateModelStatus) => {
      model = next;
    },
  };
}

describe('assistantHandlers', () => {
  it('shows who answers, which keys are saved, the models and the chats it may read', async () => {
    const t = harness();
    expect(await t.call('view')).toEqual({
      inUse: 'anthropic',
      status: '',
      keys: { anthropic: true, openai: false },
      privateModel: { size: '1.1 GB', status: 'Not downloaded yet.', actions: ['download'] },
      models: READY.models,
      auto: 'Haiku',
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
      status: 'Set up the assistant to start: choose where it thinks.',
      auto: null,
    });
    t.setSetup({ ...READY, missing: 'off' });
    expect(await t.call('view')).toMatchObject({ status: '' });
  });

  it('says how the private model stands, and what can be done with it', async () => {
    const t = harness();
    const cases: [PrivateModelStatus['phase'], boolean, string, string[]][] = [
      [
        { kind: 'downloading', done: 558_660_368 },
        true,
        'Downloading: 50% (560 MB of 1.1 GB)',
        ['pause'],
      ],
      [{ kind: 'paused', problem: '', done: 0 }, true, 'Paused at 0%.', ['resume', 'remove']],
      [{ kind: 'damaged' }, true, 'The download was damaged', ['download']],
      [{ kind: 'out-of-memory' }, true, 'This computer doesn’t', ['smaller', 'remove']],
      [{ kind: 'out-of-memory' }, false, 'This computer doesn’t', ['remove']],
    ];
    for (const [phase, smaller, status, actions] of cases) {
      t.setModel({ ...MODEL, phase, smaller });
      const view = (await t.call('view')) as {
        privateModel: { status: string; actions: string[] };
      };
      expect(view.privateModel.status.startsWith(status)).toBe(true);
      expect(view.privateModel.actions).toEqual(actions);
    }
    t.setModel({ ...MODEL, phase: { kind: 'ready' }, used: 491_400_032 });
    expect(await t.call('view')).toMatchObject({
      privateModel: { status: 'Ready. It takes 490 MB on this computer.', actions: ['remove'] },
    });
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

  it('runs the private model’s actions, and nothing else', async () => {
    const t = harness();
    for (const action of ['download', 'resume', 'pause', 'remove', 'smaller']) {
      await t.call('private-model', action);
    }
    const models = t.deps.privateModels;
    expect(models.download).toHaveBeenCalledTimes(2);
    expect(models.pause).toHaveBeenCalledOnce();
    expect(models.remove).toHaveBeenCalledOnce();
    expect(models.smaller).toHaveBeenCalledOnce();
    expect(t.handler('assistant:private-model').accepts(['delete-everything'])).toBe(false);
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
});
