import { describe, expect, it, vi } from 'vitest';
import type { Update } from './bus.ts';
import { chatKey, setAllowed } from './chats.ts';
import type { CompletionRequest, Provider } from './providers/provider.ts';
import { INSTRUCTIONS, SUMMARY_INSTRUCTIONS } from './replies.ts';
import { rewriteInstructions } from './rewrites.ts';
import { replyFlow, type Plan } from './reply-flow.ts';

const REPLIES: Plan = { mode: 'replies' };
import { fakeHost } from './testing/fake-host.ts';
import { fakeLocal } from './testing/local.ts';
import { listing } from './testing/models.ts';

const CHAT = {
  name: 'Ana',
  group: false,
  messages: [
    { outgoing: true, text: 'Are we still on?' },
    { outgoing: false, text: 'Yes, 8pm' },
  ],
};

function setup(options: Parameters<typeof fakeHost>[0] = { chat: CHAT }, models = listing()) {
  const fake = fakeHost(options);
  fake.secrets.set('apiKey.anthropic', 'sk');
  const sent: Update[] = [];
  const requests: CompletionRequest[] = [];
  const provider: Provider = {
    complete: vi.fn((request: CompletionRequest, onText: (text: string) => void) => {
      requests.push(request);
      onText('1. See you then!');
      return Promise.resolve({
        text: '1. See you then!\n2. "Great"\n\n- Perfect\n- Extra',
        truncated: false,
      });
    }),
  };
  const make = vi.fn(() => provider);
  const local = fakeLocal(provider).local;
  const flow = replyFlow(fake.host, (update) => sent.push(update), { make, list: models, local });
  return { ...fake, sent, requests, provider, make, flow };
}

describe('replyFlow', () => {
  it('shows nothing of a chat until the user allows the assistant there', async () => {
    const t = setup();
    await t.flow.prepare(REPLIES);
    expect(t.sent).toEqual([
      { type: 'preview', chat: 'Ana', allowed: false, instructions: '', transcript: '' },
    ]);
    await t.flow.send();
    expect(t.sent.at(-1)).toEqual({ type: 'problem', reason: 'not-prepared' });
    expect(t.provider.complete).not.toHaveBeenCalled();
  });

  it('sends exactly what it previewed, and offers the replies it got', async () => {
    const t = setup();
    await t.flow.prepare(REPLIES);
    await t.flow.allow(true);
    expect(t.stored.get('allowedChats')).toEqual([await chatKey('Ana')]);
    const preview = t.sent.at(-1);
    expect(preview).toEqual({
      type: 'preview',
      chat: 'Ana',
      allowed: true,
      instructions: INSTRUCTIONS,
      transcript: 'Chat: Ana\nMe: Are we still on?\nThem: Yes, 8pm',
    });
    await t.flow.send();
    expect(t.requests[0]).toMatchObject({
      instructions: INSTRUCTIONS,
      turns: [{ role: 'user', text: 'Chat: Ana\nMe: Are we still on?\nThem: Yes, 8pm' }],
    });
    expect(t.requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(t.sent.slice(-2)).toEqual([
      { type: 'progress', text: '1. See you then!' },
      { replace: false, type: 'suggestions', items: ['See you then!', 'Great', 'Perfect'] },
    ]);
    await t.flow.use(2);
    expect(t.drafts).toEqual(['Perfect']);
    expect(t.sent.at(-1)).toEqual({ type: 'used' });
  });

  it('sends only as many messages as the settings allow', async () => {
    const t = setup({ chat: CHAT, settings: { context: 5 } });
    const long = {
      ...CHAT,
      messages: Array.from({ length: 8 }, (_, i) => ({ outgoing: false, text: `m${String(i)}` })),
    };
    t.host.chat.readActive.mockResolvedValue(long);
    await t.flow.prepare(REPLIES);
    await t.flow.allow(true);
    const preview = t.sent.at(-1) as { transcript: string };
    expect(preview.transcript.split('\n')).toEqual([
      'Chat: Ana',
      'Them: m3',
      'Them: m4',
      'Them: m5',
      'Them: m6',
      'Them: m7',
    ]);
  });

  it('stops allowing a chat, and forgets what it previewed there', async () => {
    const t = setup();
    await t.flow.prepare(REPLIES);
    await t.flow.allow(true);
    await t.flow.allow(false);
    expect(t.stored.get('allowedChats')).toEqual([]);
    expect(t.sent.at(-1)).toMatchObject({ allowed: false, transcript: '' });
  });

  it('says when no chat is open, nothing is set up, or no reply was offered', async () => {
    const t = setup({ chat: null });
    await t.flow.prepare(REPLIES);
    await t.flow.allow(true);
    expect(t.sent).toEqual([
      { type: 'problem', reason: 'no-chat' },
      { type: 'problem', reason: 'no-chat' },
    ]);
    const unset = setup();
    unset.secrets.clear();
    await unset.flow.prepare(REPLIES);
    await unset.flow.allow(true);
    await unset.flow.send();
    expect(unset.sent.at(-1)).toEqual({ type: 'problem', reason: 'setup' });
    expect(unset.make).not.toHaveBeenCalled();
    // A provider that lists no model leaves nothing to ask.
    const unnamed = setup({ chat: CHAT, settings: { provider: 'openai' } }, listing([]));
    unnamed.secrets.set('apiKey.openai', 'sk');
    await unnamed.flow.prepare(REPLIES);
    await unnamed.flow.allow(true);
    await unnamed.flow.send();
    expect(unnamed.sent.at(-1)).toEqual({ type: 'problem', reason: 'setup' });
    await unset.flow.use(0);
    expect(unset.sent.at(-1)).toEqual({ type: 'problem', reason: 'invalid' });
  });

  it('stops a request when asked, or when another starts', async () => {
    const t = setup();
    await t.flow.prepare(REPLIES);
    await t.flow.allow(true);
    t.flow.cancel();
    await t.flow.send();
    await t.flow.send();
    expect(t.requests[0]?.signal?.aborted).toBe(true);
    t.flow.cancel();
    expect(t.requests[1]?.signal?.aborted).toBe(true);
  });

  it('rewrites the draft it previewed, and puts the rewrite in the draft’s place', async () => {
    const t = setup();
    t.host.composer.readDraft.mockResolvedValue('running late');
    vi.mocked(t.provider.complete).mockResolvedValueOnce({
      text: '  “I’m running a little late, sorry!”  ',
      truncated: false,
    });
    const plan: Plan = { mode: 'rewrite', style: 'translate', language: 'Portuguese' };
    await t.flow.prepare(plan);
    await t.flow.allow(true);
    expect(t.sent.at(-1)).toEqual({
      allowed: true,
      type: 'preview',
      chat: 'Ana',
      instructions: rewriteInstructions('translate', 'Portuguese'),
      transcript: 'running late',
    });
    await t.flow.send();
    expect(vi.mocked(t.provider.complete).mock.lastCall?.[0]).toMatchObject({
      instructions: rewriteInstructions('translate', 'Portuguese'),
      turns: [{ role: 'user', text: 'running late' }],
    });
    expect(t.sent.at(-1)).toEqual({
      replace: true,
      type: 'suggestions',
      items: ['I’m running a little late, sorry!'],
    });
    await t.flow.use(0);
    expect(t.host.composer.replaceDraft).toHaveBeenCalledExactlyOnceWith(
      'I’m running a little late, sorry!',
    );
    expect(t.drafts).toEqual([]);
  });

  it('says when there is no draft to rewrite, and offers nothing for an empty answer', async () => {
    const t = setup();
    const plan: Plan = { mode: 'rewrite', style: 'shorter', language: '' };
    await setAllowed(t.host.storage, 'Ana', true);
    t.host.composer.readDraft.mockResolvedValueOnce('');
    await t.flow.prepare(plan);
    expect(t.sent.at(-1)).toEqual({ type: 'problem', reason: 'empty-draft' });
    t.host.composer.readDraft.mockResolvedValueOnce(null);
    await t.flow.prepare(plan);
    expect(t.sent.at(-1)).toEqual({ type: 'problem', reason: 'empty-draft' });
    t.host.composer.readDraft.mockResolvedValueOnce('ok');
    await t.flow.prepare(plan);
    vi.mocked(t.provider.complete).mockResolvedValueOnce({ text: '""', truncated: false });
    await t.flow.send();
    expect(t.sent.at(-1)).toEqual({ replace: true, type: 'suggestions', items: [] });
  });

  it('summarizes the chat it previewed for the panel alone, offering nothing to draft', async () => {
    const t = setup();
    vi.mocked(t.provider.complete).mockResolvedValueOnce({
      text: '\n- Ana confirms 8pm.\n',
      truncated: false,
    });
    await t.flow.prepare({ mode: 'summary' });
    await t.flow.allow(true);
    expect(t.sent.at(-1)).toMatchObject({
      type: 'preview',
      instructions: SUMMARY_INSTRUCTIONS,
      transcript: 'Chat: Ana\nMe: Are we still on?\nThem: Yes, 8pm',
    });
    await t.flow.send();
    expect(t.sent.at(-1)).toEqual({ type: 'summary', text: '- Ana confirms 8pm.' });
    await t.flow.use(0);
    expect(t.sent.at(-1)).toEqual({ type: 'problem', reason: 'invalid' });
    expect(t.drafts).toEqual([]);
  });
});
