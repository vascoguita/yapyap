import type { AssistantOffer, AssistantRequest } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import { serveBar } from './bar-flow.ts';
import { chatKey, setAllowed } from './chats.ts';
import { ProviderError, type CompletionRequest, type Provider } from './providers/provider.ts';
import { COMPOSE_INSTRUCTIONS, INSTRUCTIONS } from './replies.ts';
import { fakeHost } from './testing/fake-host.ts';

const CHAT = {
  name: 'Ana',
  group: false,
  messages: [
    { outgoing: false, text: 'Dinner at 8?' },
    { outgoing: true, text: 'Maybe' },
  ],
};

const TRANSCRIPT = 'Chat: Ana\nThem: Dinner at 8?\nMe: Maybe';

function setup(answer = '1. Sounds good!\n2. "Can we make it 9?"') {
  const fake = fakeHost({ chat: CHAT });
  fake.secrets.set('apiKey.anthropic', 'sk');
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
  serveBar(host, () => provider);
  /** Makes a request in the bar and waits for the extension's answer to it. */
  const ask = async (request: AssistantRequest): Promise<AssistantOffer | undefined> => {
    const before = offers.length;
    handler(request);
    await vi.waitFor(() => {
      expect(offers.length).toBeGreaterThan(before);
    });
    return offers.at(-1);
  };
  const allow = () => setAllowed(fake.host.storage, 'Ana', true);
  return { ...fake, host, provider, requests, offers, assistant, ask, allow };
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
    const t = setup();
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
});
