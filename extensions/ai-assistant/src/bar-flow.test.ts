import type { AssistantOffer, AssistantRequest } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import { serveBar } from './bar-flow.ts';
import { chatKey, setAllowed } from './chats.ts';
import { ProviderError, type CompletionRequest, type Provider } from './providers/provider.ts';
import { COMPOSE_INSTRUCTIONS, INSTRUCTIONS } from './replies.ts';
import { fakeHost } from './testing/fake-host.ts';
import { listing } from './testing/models.ts';

const CHAT = {
  name: 'Ana',
  group: false,
  messages: [
    { outgoing: false, text: 'Dinner at 8?' },
    { outgoing: true, text: 'Maybe' },
  ],
};

const TRANSCRIPT = 'Chat: Ana\nThem: Dinner at 8?\nMe: Maybe';

function setup(
  answer = '1. Sounds good!\n2. "Can we make it 9?"',
  key: string | null = 'sk',
  settings: Record<string, string> = {},
) {
  const fake = fakeHost({ chat: CHAT, settings });
  if (key !== null) {
    fake.secrets.set('apiKey.anthropic', key);
  }
  const list = listing();
  const requests: CompletionRequest[] = [];
  const provider: Provider = {
    complete: vi.fn((request: CompletionRequest, onText: (text: string) => void) => {
      requests.push(request);
      // The bar shows only the finished answer, so streamed pieces go nowhere.
      onText(answer);
      return Promise.resolve({ text: answer, truncated: false });
    }),
  };
  const offers: AssistantOffer[] = [];
  let handler: (request: AssistantRequest) => unknown = () => undefined;
  const assistant = {
    offer: vi.fn((offer: AssistantOffer) => {
      offers.push(offer);
      return Promise.resolve();
    }),
    onRequest: vi.fn((given: (request: AssistantRequest) => unknown) => {
      handler = given;
    }),
  };
  const host = { ...fake.host, assistant };
  serveBar(host, () => provider, list);
  /** The bar's first offer, which names the model before anyone asks. */
  const started = async (): Promise<AssistantOffer | undefined> => {
    await vi.waitFor(() => {
      expect(offers.length).toBeGreaterThan(0);
    });
    return offers[0];
  };
  /**
   * Makes a request in the bar and waits for the extension's answer to it,
   * leaving out the model choice that comes with every offer.
   */
  const ask = async (request: AssistantRequest): Promise<AssistantOffer | undefined> => {
    await started();
    const before = offers.length;
    handler(request);
    await vi.waitFor(() => {
      expect(offers.length).toBeGreaterThan(before);
    });
    const last = offers.at(-1) ?? { suggestions: [] };
    return Object.fromEntries(
      Object.entries(last).filter(([name]) => name !== 'choice'),
    ) as unknown as AssistantOffer;
  };
  const allow = () => setAllowed(fake.host.storage, 'Ana', true);
  /** Passes the user's pick in the bar, which YapYap answers with no offer of its own. */
  const choose = async (value: string): Promise<void> => {
    await started();
    handler({ type: 'choose', value });
    await vi.waitFor(() => {
      expect(fake.stored.get('model')).toBe(value);
    });
  };
  return {
    ...fake,
    host,
    provider,
    requests,
    offers,
    assistant,
    ask,
    allow,
    started,
    list,
    choose,
    handler: (request: AssistantRequest) => handler(request),
  };
}

describe('serveBar', () => {
  it('asks before anything of a chat leaves, then allows only that chat and answers', async () => {
    const t = setup();
    expect(await t.ask({ type: 'suggest' })).toEqual({
      suggestions: [],
      status: expect.stringContaining('Allow it in this chat?') as string,
      confirm: 'Allow here',
    });
    expect(t.provider.complete).not.toHaveBeenCalled();
    expect(await t.ask({ type: 'confirm' })).toEqual({
      suggestions: ['Sounds good!', 'Can we make it 9?'],
      status: '',
    });
    expect(t.stored.get('allowedChats')).toEqual([await chatKey('Ana')]);
    expect(t.requests).toEqual([
      { instructions: INSTRUCTIONS, turns: [{ role: 'user', text: TRANSCRIPT }] },
    ]);
  });

  it('writes the message the user describes, as one suggestion', async () => {
    const t = setup('  “I’ll be ten minutes late, sorry!”  ');
    await t.allow();
    expect(await t.ask({ type: 'prompt', text: 'say I am late' })).toEqual({
      suggestions: ['I’ll be ten minutes late, sorry!'],
      status: '',
    });
    expect(t.requests[0]).toEqual({
      instructions: COMPOSE_INSTRUCTIONS,
      turns: [{ role: 'user', text: `${TRANSCRIPT}\n\nWhat I want to say: say I am late` }],
    });
  });

  it('keeps each suggestion within the bar’s limit, and says when there is none', async () => {
    const long = setup('x'.repeat(1500));
    await long.allow();
    expect((await long.ask({ type: 'prompt', text: 'go' }))?.suggestions).toEqual([
      'x'.repeat(1000),
    ]);
    const empty = setup('  ');
    await empty.allow();
    expect(await empty.ask({ type: 'suggest' })).toEqual({
      suggestions: [],
      status: 'The model had nothing to suggest. Try again.',
    });
  });

  it('allows nothing when the chat changed, or nothing was asked, before the user agreed', async () => {
    const t = setup();
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'You opened another chat. Ask again here.',
    );
    await t.ask({ type: 'suggest' });
    t.host.chat.readActive.mockResolvedValue({ ...CHAT, name: 'Bo' });
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'You opened another chat. Ask again here.',
    );
    t.host.chat.readActive.mockResolvedValue(null);
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'You opened another chat. Ask again here.',
    );
    expect(t.stored.get('allowedChats')).toBeUndefined();
    expect(t.provider.complete).not.toHaveBeenCalled();
  });

  it('says what is missing: an open chat, or the setup', async () => {
    const t = setup(undefined, 'sk', { provider: 'anthropic' });
    t.host.chat.readActive.mockResolvedValue(null);
    expect(await t.ask({ type: 'suggest' })).toEqual({
      suggestions: [],
      status: 'Open a chat first.',
    });
    t.host.chat.readActive.mockResolvedValue(CHAT);
    await t.allow();
    t.secrets.clear();
    expect((await t.ask({ type: 'suggest' }))?.status).toBe(
      'Set up the assistant in its panel first: Extensions → AI assistant.',
    );
  });

  it('explains a failed request, and keeps answering after a refused offer', async () => {
    const t = setup();
    await t.allow();
    vi.mocked(t.provider.complete).mockRejectedValueOnce(new ProviderError('auth'));
    expect(await t.ask({ type: 'suggest' })).toEqual({
      suggestions: [],
      status: 'The provider did not accept your key.',
    });
    t.assistant.offer.mockImplementationOnce((offer) => {
      t.offers.push(offer);
      return Promise.reject(new Error('not granted'));
    });
    await t.ask({ type: 'suggest' });
    expect((await t.ask({ type: 'suggest' }))?.suggestions).toHaveLength(2);
  });

  it('names the model in use from the start, with Auto first and the models the provider lists', async () => {
    const t = setup();
    expect(await t.started()).toEqual({
      suggestions: [],
      status: '',
      choice: {
        label: 'Model',
        current: 'auto',
        options: [
          { value: 'auto', label: 'Auto (Claude Haiku 5.5)' },
          { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
          { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
        ],
      },
    });
  });

  it('keeps the user’s pick, offering nothing for it, and names it in the next offer', async () => {
    const t = setup();
    await t.allow();
    await t.choose('claude-opus-5-5');
    const offered = t.offers.length;
    await t.ask({ type: 'suggest' });
    expect(t.offers).toHaveLength(offered + 1);
    expect(t.offers.at(-1)?.choice?.current).toBe('claude-opus-5-5');
    // A pick the provider no longer lists shows as Auto.
    await t.choose('claude-gone');
    await t.ask({ type: 'suggest' });
    expect(t.offers.at(-1)?.choice?.current).toBe('auto');
  });

  it('offers nothing to pick, and asks no provider, before the assistant is set up', async () => {
    const t = setup(undefined, null);
    expect((await t.started())?.choice).toEqual({ label: 'Model', current: 'auto', options: [] });
    expect(t.list).not.toHaveBeenCalled();
  });

  it('leaves out models the bar could not show, though Auto may still use them', async () => {
    const t = setup();
    t.list.mockResolvedValue([
      { id: 'x'.repeat(101), label: 'Too long' },
      { id: 'm', label: 'L'.repeat(70) },
    ]);
    expect((await t.started())?.choice?.options).toEqual([
      { value: 'auto', label: 'Auto (Too long)' },
      { value: 'm', label: 'L'.repeat(60) },
    ]);
  });

  it('lists a local server’s models without a key, which such a server does not need', async () => {
    const t = setup(undefined, null, {
      provider: 'compatible',
      endpoint: 'http://localhost:11435/v1',
    });
    await t.started();
    expect(t.list).toHaveBeenCalledWith(expect.objectContaining({ provider: 'compatible' }), '');
  });

  const SEARCH_OFFER = {
    suggestions: [],
    status: 'Use an AI model on this computer? It stays private: your messages never leave it.',
    confirm: 'Find a model',
  };

  const OLLAMA = { server: 'localhost:11434', endpoint: 'http://localhost:11434/v1' };

  it('offers to find a model on this computer to someone who set nothing up, before anything else', async () => {
    const t = setup(undefined, null);
    expect(await t.started()).toMatchObject(SEARCH_OFFER);
    expect(await t.ask({ type: 'suggest' })).toEqual(SEARCH_OFFER);
    t.host.chat.readActive.mockResolvedValue(null);
    expect(await t.ask({ type: 'prompt', text: 'hi' })).toEqual(SEARCH_OFFER);
    expect(t.host.localModels.find).not.toHaveBeenCalled();
    expect(t.list).not.toHaveBeenCalled();
  });

  it('finds a model on the user’s click, uses the first server with models, and names them', async () => {
    const t = setup(undefined, null);
    t.host.localModels.find.mockResolvedValueOnce([
      { ...OLLAMA, models: [] },
      { server: 'localhost:11435', endpoint: 'http://localhost:11435/v1', models: ['tiny'] },
    ]);
    await t.started();
    expect(await t.ask({ type: 'confirm' })).toEqual({
      suggestions: [],
      status: 'Found an AI model on this computer. Ask for suggestions: your messages stay on it.',
    });
    expect(t.stored.get('localServer')).toEqual({ endpoint: 'http://localhost:11435/v1' });
    expect(t.list).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'compatible', endpoint: 'http://localhost:11435/v1' }),
      '',
    );
    expect(t.offers.at(-1)?.choice?.options).toHaveLength(3);
    // The next confirm is the chat's consent again, not another search.
    await t.ask({ type: 'suggest' });
    expect(await t.ask({ type: 'confirm' })).toMatchObject({ status: '' });
    expect(t.host.localModels.find).toHaveBeenCalledOnce();
  });

  it('says plainly why no model on this computer could be used', async () => {
    const t = setup(undefined, null);
    await t.started();
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'No AI model runs on this computer. Install Ollama from ollama.com and download a model, or choose a provider in Extensions → AI assistant → Settings.',
    );
    expect(t.stored.has('localServer')).toBe(false);
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockResolvedValueOnce([{ ...OLLAMA, models: [] }]);
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'A model server runs on this computer, but it has no model yet. Download one in it, then try again.',
    );
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockRejectedValueOnce({ kind: 'not-granted', message: 'no' });
    expect((await t.ask({ type: 'confirm' }))?.status).toContain('did not let the assistant look');
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockRejectedValueOnce({ kind: 'invalid', message: 'unknown' });
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'Update YapYap to find a model on this computer.',
    );
  });

  it('says so when the server it found does not answer, or keeping it failed', async () => {
    const t = setup(undefined, null);
    t.host.localModels.find.mockResolvedValue([{ ...OLLAMA, models: ['tiny'] }]);
    t.list.mockResolvedValue([]);
    await t.started();
    expect((await t.ask({ type: 'confirm' }))?.status).toContain(
      'The model server on this computer does not answer.',
    );
    await t.allow();
    expect((await t.ask({ type: 'suggest' }))?.status).toContain('does not answer');
    t.stored.clear();
    await t.ask({ type: 'suggest' });
    t.host.storage.set.mockRejectedValueOnce(new Error('full'));
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      'Looking for a model on this computer failed. Try again.',
    );
  });

  it('keeps answering when its pick cannot be kept', async () => {
    const t = setup();
    await t.started();
    t.host.storage.set.mockRejectedValueOnce(new Error('full'));
    t.handler({ type: 'choose', value: 'claude-opus-5-5' });
    expect(await t.ask({ type: 'suggest' })).toMatchObject({
      suggestions: expect.any(Array) as unknown,
    });
  });
});
