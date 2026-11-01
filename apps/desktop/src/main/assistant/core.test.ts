import { describe, expect, it, vi } from 'vitest';
import { assistantCore } from './core.ts';

const SETTINGS = {
  enabled: true,
  provider: 'auto',
  model: 'auto',
  autoSuggest: true,
  messages: '10',
  localServer: '',
} as const;

describe('assistantCore', () => {
  it('reads the setup from the settings, the keys and the private model', async () => {
    const list = vi.fn(() => Promise.resolve([{ id: 'qwen', label: 'Private model (Qwen)' }]));
    const keys = { get: vi.fn(() => Promise.resolve(undefined)) };
    const core = assistantCore({
      settings: { current: () => ({ assistant: SETTINGS }) as never },
      keys,
      privateModels: { ready: () => ({ id: 'qwen', name: 'Qwen' }) as never },
      engine: { complete: vi.fn() },
      fetch: vi.fn(),
      list,
    });
    await expect(core.setup()).resolves.toMatchObject({ provider: 'built-in', model: 'qwen' });
    expect(keys.get.mock.calls).toEqual([['anthropic'], ['openai']]);
  });

  it('asks the setup’s model exactly the instructions and text it is given', async () => {
    const complete = vi.fn((_turns: unknown, onText: (text: string) => void) => {
      onText('Hi');
      return Promise.resolve({ text: 'Hi there', truncated: false });
    });
    const core = assistantCore({
      settings: { current: () => ({ assistant: SETTINGS }) as never },
      keys: { get: () => Promise.resolve(undefined) },
      privateModels: { ready: () => undefined },
      engine: { complete },
      fetch: vi.fn(),
      list: vi.fn(),
    });
    const setup = {
      provider: 'built-in',
      missing: '',
      models: [],
      auto: undefined,
      model: 'qwen',
      key: '',
      endpoint: '',
    } as const;
    await expect(core.ask(setup, 'Summarize', 'Chat: Ana')).resolves.toBe('Hi there');
    expect(complete).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'Summarize' },
        { role: 'user', content: 'Chat: Ana' },
      ],
      expect.any(Function),
      undefined,
    );
  });
});
