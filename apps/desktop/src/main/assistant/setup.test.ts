import { describe, expect, it, vi } from 'vitest';
import { chosenProvider, currentSetup, providerFor, type SetupInputs } from './setup.ts';

const SETTINGS: SetupInputs['settings'] = {
  enabled: true,
  provider: 'auto',
  model: 'auto',
  autoSuggest: true,
  messages: '10',
  localServer: '',
};

const NOTHING: SetupInputs = {
  settings: SETTINGS,
  keys: { anthropic: undefined, openai: undefined },
  privateModel: undefined,
};

const PRIVATE = { id: 'qwen', name: 'Qwen' };
const LOCAL = 'http://localhost:11434/v1';
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
  it('takes the user’s choice, or on Automatic the most private one set up', () => {
    expect(chosenProvider(with_({}, { provider: 'openai' }))).toBe('openai');
    expect(chosenProvider(NOTHING)).toBeUndefined();
    const everything = with_(
      { keys: { anthropic: 'a', openai: 'o' }, privateModel: PRIVATE },
      { localServer: LOCAL },
    );
    expect(chosenProvider(everything)).toBe('built-in');
    expect(chosenProvider({ ...everything, privateModel: undefined })).toBe('local');
    expect(chosenProvider(with_({ keys: { anthropic: 'a', openai: 'o' } }))).toBe('anthropic');
    expect(chosenProvider(with_({ keys: { anthropic: undefined, openai: 'o' } }))).toBe('openai');
  });
});

describe('currentSetup', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  it('says what is missing without asking any provider', async () => {
    const list = vi.fn(() => Promise.resolve(LISTED));
    const cases: [SetupInputs, string][] = [
      [NOTHING, 'setup'],
      [with_({}, { enabled: false, provider: 'openai' }), 'off'],
      [with_({}, { provider: 'anthropic' }), 'key'],
      [with_({}, { provider: 'built-in' }), 'download'],
      [with_({}, { provider: 'local' }), 'setup'],
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
    const keyed = with_({ keys: { anthropic: 'sk', openai: undefined } });
    await expect(currentSetup(keyed, list, fetch)).resolves.toEqual({
      provider: 'anthropic',
      missing: '',
      models: LISTED,
      auto: LISTED[1],
      model: 'claude-haiku',
      key: 'sk',
      endpoint: '',
    });
    expect(list).toHaveBeenCalledWith(
      { provider: 'anthropic', key: 'sk', endpoint: '', privateModel: undefined },
      fetch,
    );
    const picked = { ...keyed, settings: { ...keyed.settings, model: 'claude-opus' } };
    await expect(currentSetup(picked, list, fetch)).resolves.toMatchObject({
      model: 'claude-opus',
    });
    const gone = { ...keyed, settings: { ...keyed.settings, model: 'claude-gone' } };
    await expect(currentSetup(gone, list, fetch)).resolves.toMatchObject({ model: 'claude-haiku' });
  });

  it('lists the downloaded private model', async () => {
    const list = vi.fn(() => Promise.resolve([{ id: 'qwen', label: 'Private model (Qwen)' }]));
    await expect(
      currentSetup(with_({ privateModel: PRIVATE }, { provider: 'built-in' }), list, fetch),
    ).resolves.toMatchObject({ provider: 'built-in', missing: '', model: 'qwen' });
  });

  it('names the server on this computer, and says when a provider lists no model', async () => {
    const empty = vi.fn(() => Promise.resolve([]));
    await expect(
      currentSetup(with_({}, { provider: 'local', localServer: LOCAL }), empty, fetch),
    ).resolves.toMatchObject({ provider: 'local', endpoint: LOCAL, key: '', missing: 'model' });
  });
});

describe('providerFor', () => {
  const setup = {
    missing: '',
    models: [],
    auto: undefined,
    model: 'm',
    key: 'k',
    endpoint: LOCAL,
  } as const;
  const engine = { complete: vi.fn(() => Promise.resolve({ text: 'Hi', truncated: false })) };

  it('makes the provider the setup describes', async () => {
    for (const provider of ['anthropic', 'openai', 'local'] as const) {
      expect(providerFor({ ...setup, provider }, vi.fn(), engine).complete).toBeTypeOf('function');
    }
    const local = providerFor({ ...setup, provider: 'built-in' }, vi.fn(), engine);
    await expect(local.complete({ instructions: 'x', turns: [] }, vi.fn())).resolves.toEqual({
      text: 'Hi',
      truncated: false,
    });
  });
});
