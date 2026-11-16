import { describe, expect, it, vi } from 'vitest';
import { NO_KEY } from './models.ts';
import { chosenProvider, currentSetup, providerFor, type SetupInputs } from './setup.ts';

const SETTINGS: SetupInputs['settings'] = {
  enabled: true,
  provider: 'none',
  model: 'auto',
  autoSuggest: true,
  chats: 'chosen',
  messages: '50',
  server: '',
};

const NOTHING: SetupInputs = {
  settings: SETTINGS,
  keys: { anthropic: undefined, openai: undefined, server: undefined },
};

const SERVER = 'http://192.168.1.20:11434/v1';
const LISTED = [
  { id: 'claude-opus', label: 'Opus' },
  { id: 'claude-haiku', label: 'Haiku' },
];

const with_ = (change: Partial<SetupInputs>, settings: Partial<SetupInputs['settings']> = {}) => ({
  ...NOTHING,
  ...change,
  settings: { ...SETTINGS, ...settings },
});

describe('chosenProvider', () => {
  it('takes the user’s choice, and nobody before they choose, whatever keys are saved', () => {
    expect(chosenProvider({ ...SETTINGS, provider: 'openai' })).toBe('openai');
    expect(chosenProvider({ ...SETTINGS, provider: 'server' })).toBe('server');
    expect(chosenProvider(SETTINGS)).toBeUndefined();
  });
});

describe('currentSetup', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  it('says what is missing without asking any provider', async () => {
    const list = vi.fn(() => Promise.resolve(LISTED));
    const cases: [SetupInputs, string][] = [
      [with_({ keys: { anthropic: 'sk', openai: 'sk', server: 'sk' } }), 'setup'],
      [with_({}, { enabled: false, provider: 'openai' }), 'off'],
      [with_({}, { provider: 'anthropic' }), 'key'],
      [with_({}, { provider: 'server' }), 'setup'],
    ];
    for (const [inputs, missing] of cases) {
      await expect(currentSetup(inputs, list, fetch)).resolves.toMatchObject({
        missing,
        models: [],
        model: '',
      });
    }
    expect(list).not.toHaveBeenCalled();
  });

  it('uses the model the user picked while the provider lists it, or Auto’s', async () => {
    const list = vi.fn(() => Promise.resolve(LISTED));
    const keyed = with_(
      { keys: { anthropic: 'sk', openai: undefined, server: undefined } },
      { provider: 'anthropic' },
    );
    await expect(currentSetup(keyed, list, fetch)).resolves.toEqual({
      provider: 'anthropic',
      missing: '',
      models: LISTED,
      auto: LISTED[1],
      model: 'claude-haiku',
      key: 'sk',
      endpoint: '',
    });
    expect(list).toHaveBeenCalledWith({ provider: 'anthropic', key: 'sk', endpoint: '' }, fetch);
    const picked = { ...keyed, settings: { ...keyed.settings, model: 'claude-opus' } };
    await expect(currentSetup(picked, list, fetch)).resolves.toMatchObject({
      model: 'claude-opus',
    });
    const gone = { ...keyed, settings: { ...keyed.settings, model: 'claude-gone' } };
    await expect(currentSetup(gone, list, fetch)).resolves.toMatchObject({ model: 'claude-haiku' });
  });

  it('reaches a model server at its address, with its key if it has one, and none needed', async () => {
    const list = vi.fn(() => Promise.resolve([{ id: 'llama', label: 'llama' }]));
    const server = with_({}, { provider: 'server', server: SERVER });
    await expect(currentSetup(server, list, fetch)).resolves.toMatchObject({
      provider: 'server',
      endpoint: SERVER,
      key: '',
      missing: '',
      model: 'llama',
    });
    const keyed = { ...server, keys: { ...NOTHING.keys, server: 'sk-cloud' } };
    await expect(currentSetup(keyed, list, fetch)).resolves.toMatchObject({ key: 'sk-cloud' });
    expect(list).toHaveBeenLastCalledWith(
      { provider: 'server', key: 'sk-cloud', endpoint: SERVER },
      fetch,
    );
  });

  it('says when a provider lists no model', async () => {
    const empty = vi.fn(() => Promise.resolve([]));
    await expect(
      currentSetup(with_({}, { provider: 'server', server: SERVER }), empty, fetch),
    ).resolves.toMatchObject({ provider: 'server', missing: 'model' });
  });
});

describe('providerFor', () => {
  const setup = {
    missing: '',
    models: [],
    auto: undefined,
    model: 'm',
    key: 'k',
    endpoint: SERVER,
  } as const;

  /** The Authorization header the provider sends, from the first request it makes. */
  async function authorizationOf(
    provider: ReturnType<typeof providerFor>,
    fetch: typeof globalThis.fetch,
  ) {
    await provider
      .complete({ instructions: 'x', context: '', task: '' }, vi.fn())
      .catch(() => undefined);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    return {
      url: vi.mocked(fetch).mock.calls[0]?.[0],
      auth: new Headers(init?.headers).get('authorization'),
    };
  }

  it('makes the provider the setup describes', () => {
    for (const provider of ['anthropic', 'openai', 'server'] as const) {
      expect(providerFor({ ...setup, provider }, vi.fn()).complete).toBeTypeOf('function');
    }
  });

  it('sends a model server its key, or a placeholder the SDK needs when it has none', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('offline')));
    await expect(
      authorizationOf(providerFor({ ...setup, provider: 'server' }, fetch), fetch),
    ).resolves.toEqual({ url: `${SERVER}/chat/completions`, auth: 'Bearer k' });
    const keyless = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('offline')));
    await expect(
      authorizationOf(providerFor({ ...setup, key: '', provider: 'server' }, keyless), keyless),
    ).resolves.toMatchObject({ auth: `Bearer ${NO_KEY}` });
  });
});
