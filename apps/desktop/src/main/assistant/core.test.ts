import { describe, expect, it, vi } from 'vitest';
import { assistantCore } from './core.ts';

const SETTINGS = {
  enabled: true,
  provider: 'server',
  model: 'auto',
  autoSuggest: true,
  summaries: true,
  summarizeFrom: 10,
  messages: 50,
  server: 'http://localhost:11434/v1',
} as const;

/** A model server's streamed answer, as OpenAI's API sends one. */
function streamed(text: string): Response {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'c',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'llama',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  return new Response(`${chunk({ content: text }, null)}${chunk({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('assistantCore', () => {
  it('reads the setup from the settings and every key', async () => {
    const list = vi.fn(() => Promise.resolve([{ id: 'llama', label: 'llama' }]));
    const keys = { get: vi.fn(() => Promise.resolve(undefined)) };
    const core = assistantCore({
      settings: { current: () => ({ assistant: SETTINGS }) as never },
      keys,
      fetch: vi.fn(),
      list,
    });
    await expect(core.setup()).resolves.toMatchObject({ provider: 'server', model: 'llama' });
    expect(keys.get.mock.calls).toEqual([['anthropic'], ['openai'], ['server']]);
  });

  it('asks the setup’s model exactly the instructions and text it is given', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(streamed('Hi there')));
    const core = assistantCore({
      settings: { current: () => ({ assistant: SETTINGS }) as never },
      keys: { get: () => Promise.resolve(undefined) },
      fetch,
      list: vi.fn(),
    });
    const setup = {
      provider: 'server',
      missing: '',
      models: [],
      auto: undefined,
      model: 'llama',
      key: '',
      endpoint: SETTINGS.server,
    } as const;
    const prompt = {
      instructions: 'Rewrite warmly',
      context: '<chat></chat>',
      task: 'Running late',
    };
    await expect(core.ask(setup, prompt)).resolves.toBe('Hi there');
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as { messages: unknown };
    expect(body.messages).toEqual([
      { role: 'system', content: 'Rewrite warmly' },
      { role: 'user', content: '<chat></chat>\n\nRunning late' },
    ]);
    // A request called off before it is sent never reaches the model.
    const controller = new AbortController();
    controller.abort();
    await expect(core.ask(setup, prompt, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
