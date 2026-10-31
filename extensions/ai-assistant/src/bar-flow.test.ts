import type { AssistantOffer, AssistantRequest } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import { serveBar } from './bar-flow.ts';
import { chatKey, setAllowed } from './chats.ts';
import { ProviderError, type CompletionRequest, type Provider } from './providers/provider.ts';
import { COMPOSE_INSTRUCTIONS, INSTRUCTIONS } from './replies.ts';
import { fakeHost } from './testing/fake-host.ts';
import { fakeLocal } from './testing/local.ts';
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
  const model = fakeLocal(provider);
  serveBar(host, model.local, { make: () => provider, list });
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
    model,
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

  const PRIVATE =
    'Use a private model on this computer (about 1.1 GB, downloaded once)? Your messages never leave it.';

  it('says briefly why no model on this computer could be used, and offers the private model', async () => {
    const t = setup(undefined, null);
    await t.started();
    expect(await t.ask({ type: 'confirm' })).toEqual({
      suggestions: [],
      status: `No AI model runs on this computer. ${PRIVATE}`,
      confirm: 'Use a private model',
    });
    expect(t.stored.has('localServer')).toBe(false);
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockResolvedValueOnce([{ ...OLLAMA, models: [] }]);
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      `The model server on this computer has no model yet. ${PRIVATE}`,
    );
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockRejectedValueOnce({ kind: 'not-granted', message: 'no' });
    expect((await t.ask({ type: 'confirm' }))?.status).toContain('did not let the assistant look');
    await t.ask({ type: 'suggest' });
    t.host.localModels.find.mockRejectedValueOnce({ kind: 'invalid', message: 'unknown' });
    expect((await t.ask({ type: 'confirm' }))?.status).toBe(
      `This YapYap cannot look for a model on this computer. ${PRIVATE}`,
    );
    // Every offer stays within what the bar shows.
    for (const offer of t.offers) {
      expect(offer.status?.length ?? 0).toBeLessThanOrEqual(200);
    }
    expect(t.model.local.download).not.toHaveBeenCalled();
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
      `Looking for a model on this computer failed. ${PRIVATE}`,
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

  describe('the private model', () => {
    const PICKED = { model: 'qwen', name: 'Qwen2.5 1.5B', ready: false };

    /** Someone who picked the private model, which the bar lists once it is all there. */
    function picked(ready: boolean) {
      const t = setup(undefined, null);
      t.stored.set('builtIn', { ...PICKED, ready });
      t.list.mockResolvedValue([{ id: 'qwen', label: 'Private model (Qwen2.5 1.5B)' }]);
      return t;
    }

    it('downloads only on the user’s click after the search found nothing, and says how far it is', async () => {
      const t = setup(undefined, null);
      await t.started();
      await t.ask({ type: 'confirm' });
      expect(t.model.local.download).not.toHaveBeenCalled();
      const offered = t.offers.length;
      expect(await t.ask({ type: 'confirm' })).toEqual({
        suggestions: [],
        status: 'Downloading the private model: 0% (0 of 1,117 MB)',
      });
      expect(t.model.local.download).toHaveBeenCalledOnce();
      // The models to pick from change only once the model is ready.
      expect(t.offers[offered]).not.toHaveProperty('choice');
    });

    it('follows the download in the bar as it goes, and offers to resume it when it stops', async () => {
      const t = picked(false);
      await t.started();
      t.model.tell({ kind: 'downloading', done: 450_000_000 });
      expect(t.offers.at(-1)).toEqual({
        suggestions: [],
        status: 'Downloading the private model: 40% (450 of 1,117 MB)',
      });
      t.model.tell({ kind: 'paused', done: 450_000_000, problem: 'download-failed' });
      expect(t.offers.at(-1)).toEqual({
        suggestions: [],
        status: 'The download stopped. Check your connection, then resume: 40% (450 of 1,117 MB).',
        confirm: 'Resume',
      });
      await t.ask({ type: 'confirm' });
      expect(t.model.local.download).toHaveBeenCalledOnce();
      t.model.tell({ kind: 'damaged' });
      expect(t.offers.at(-1)?.confirm).toBe('Download again');
      t.model.tell({ kind: 'warming' });
      expect(t.offers.at(-1)?.status).toBe('Warming up the model…');
      // A refused offer leaves the next one to tell.
      t.assistant.offer.mockRejectedValueOnce(new Error('not granted'));
      t.model.tell({ kind: 'downloading', done: 1 });
    });

    it('says how the download stands when asked for suggestions before the model is all there', async () => {
      const t = picked(false);
      t.model.set({ kind: 'paused', done: 450_000_000, problem: '' });
      expect(await t.ask({ type: 'suggest' })).toEqual({
        suggestions: [],
        status: 'The private model’s download is paused: 40% (450 of 1,117 MB).',
        confirm: 'Resume',
      });
      t.model.set({ kind: 'none' });
      expect((await t.ask({ type: 'suggest' }))?.confirm).toBe('Use a private model');
      await t.ask({ type: 'confirm' });
      expect(t.model.local.download).toHaveBeenCalledOnce();
    });

    it('names the model once it is ready, and goes back to the start once it is removed', async () => {
      const t = picked(false);
      await t.started();
      t.model.tell({ kind: 'downloading', done: 1 });
      t.stored.set('builtIn', { ...PICKED, ready: true });
      const before = t.offers.length;
      t.model.tell({ kind: 'ready' });
      await vi.waitFor(() => {
        expect(t.offers.length).toBeGreaterThan(before);
      });
      expect(t.offers.at(-1)).toMatchObject({
        status: 'The private model is ready. Your messages stay on this computer.',
        choice: {
          current: 'auto',
          options: [{ label: 'Auto (Private model (Qwen2.5 1.5B))' }, {}],
        },
      });
      // Warming up and running out of memory come with a request's own answer.
      const shown = t.offers.length;
      t.model.tell({ kind: 'ready' });
      t.model.tell({ kind: 'out-of-memory' });
      expect(t.offers).toHaveLength(shown);
      t.stored.delete('builtIn');
      t.model.tell({ kind: 'none' });
      await vi.waitFor(() => {
        expect(t.offers.length).toBeGreaterThan(shown);
      });
      expect(t.offers.at(-1)?.confirm).toBe('Find a model');
    });

    it('asks before reading a chat, saying its messages stay here, then answers with the model', async () => {
      const t = picked(true);
      expect(await t.ask({ type: 'suggest' })).toEqual({
        suggestions: [],
        status:
          'To help here, the assistant reads this chat’s latest messages, which stay on this computer. Allow it in this chat?',
        confirm: 'Allow here',
      });
      expect((await t.ask({ type: 'confirm' }))?.suggestions).toEqual([
        'Sounds good!',
        'Can we make it 9?',
      ]);
      // The model's provider is the page's private model.
      expect(t.model.local.provider()).toBe(t.provider);
    });

    it('offers the smaller model when this one does not fit in memory', async () => {
      const t = picked(true);
      await t.allow();
      vi.mocked(t.provider.complete).mockRejectedValueOnce(new ProviderError('out-of-memory'));
      t.model.set({ kind: 'out-of-memory' });
      expect(await t.ask({ type: 'suggest' })).toEqual({
        suggestions: [],
        status: 'This computer doesn’t have enough memory for this model. Try the smaller one?',
        confirm: 'Try the smaller one',
      });
      await t.ask({ type: 'confirm' });
      expect(t.model.local.smaller).toHaveBeenCalledOnce();
    });

    it('tries again while YapYap’s rate refuses, but explains a provider’s own limit', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const t = setup();
        await t.allow();
        await t.started();
        const busy = Object.assign(new Error('too often'), { kind: 'rate-limited' });
        t.host.chat.readActive.mockRejectedValueOnce(busy).mockRejectedValueOnce(busy);
        t.handler({ type: 'suggest' });
        // A second, then two more: each wait doubles.
        await vi.advanceTimersByTimeAsync(3000);
        await vi.waitFor(() => {
          expect(t.offers.at(-1)?.suggestions).toHaveLength(2);
        });
        vi.mocked(t.provider.complete).mockRejectedValueOnce(new ProviderError('rate-limited'));
        expect((await t.ask({ type: 'suggest' }))?.status).toBe(
          'The provider is busy or your quota is used up. Try again later.',
        );
        // Three refusals in a row leave the bar as it was.
        t.host.chat.readActive.mockRejectedValue(busy);
        const before = t.offers.length;
        t.handler({ type: 'suggest' });
        await vi.advanceTimersByTimeAsync(3000);
        expect(t.offers).toHaveLength(before);
      } finally {
        vi.useRealTimers();
      }
    });

    it('tries once more when a burst of clicks ran past YapYap’s rate', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const t = setup();
        await t.allow();
        await t.started();
        const before = t.offers.length;
        t.assistant.offer.mockImplementationOnce(() =>
          Promise.reject(Object.assign(new Error('too often'), { kind: 'rate-limited' })),
        );
        t.handler({ type: 'suggest' });
        await vi.waitFor(() => {
          expect(t.assistant.offer.mock.calls.length).toBeGreaterThan(before);
        });
        await vi.advanceTimersByTimeAsync(1000);
        await vi.waitFor(() => {
          expect(t.offers.at(-1)?.suggestions).toHaveLength(2);
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
