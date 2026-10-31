import { describe, expect, it, vi } from 'vitest';
import { servePanel, stateOf, type Channel } from './assistant.ts';
import type { Update } from './bus.ts';
import { ProviderError, type Provider } from './providers/provider.ts';
import { fakeHost } from './testing/fake-host.ts';
import { listing } from './testing/models.ts';

function fakeChannel() {
  const sent: Update[] = [];
  const channel: Channel & { send: (data: unknown) => void } = {
    onmessage: null,
    postMessage: (message) => sent.push(message),
    send: (data) => channel.onmessage?.({ data } as MessageEvent),
  };
  return { channel, sent };
}

describe('stateOf', () => {
  it('says what is missing, never the key', async () => {
    const { host, secrets } = fakeHost();
    const list = listing();
    await expect(stateOf(host, list)).resolves.toEqual({
      type: 'state',
      provider: 'anthropic',
      model: '',
      missing: 'key',
      search: true,
    });
    expect(list).not.toHaveBeenCalled();
    secrets.set('apiKey.anthropic', 'sk-secret');
    const state = await stateOf(host, list);
    // Auto picks the newest of Claude's quick models.
    expect(state).toMatchObject({ model: 'claude-haiku-5-5', missing: '' });
    expect(JSON.stringify(state)).not.toContain('sk-secret');
  });
});

/** Serves the panel, then forgets the state this page announces as it starts. */
async function serve(
  host: Parameters<typeof servePanel>[0],
  { channel, sent }: ReturnType<typeof fakeChannel>,
  make?: () => Provider,
): Promise<void> {
  servePanel(host, channel, make, listing());
  await vi.waitFor(() => {
    expect(sent).toHaveLength(1);
  });
  sent.length = 0;
}

describe('servePanel', () => {
  it('finds a model on this computer when the panel asks, and uses it', async () => {
    const { host, stored } = fakeHost();
    host.localModels.find.mockResolvedValueOnce([
      { server: 'localhost:11435', endpoint: 'http://localhost:11435/v1', models: ['tiny'] },
    ]);
    const ends = fakeChannel();
    await serve(host, ends);
    ends.channel.send({ type: 'find-model' });
    await vi.waitFor(() => {
      expect(ends.sent).toHaveLength(1);
    });
    expect(stored.get('localServer')).toEqual({ endpoint: 'http://localhost:11435/v1' });
    expect(ends.sent[0]).toEqual({
      type: 'state',
      provider: 'local',
      model: 'claude-opus-5-5',
      missing: '',
      search: false,
    });
  });

  it('says why when no model on this computer could be used, then the unchanged state', async () => {
    const { host, stored } = fakeHost();
    const ends = fakeChannel();
    await serve(host, ends);
    ends.channel.send({ type: 'find-model' });
    await vi.waitFor(() => {
      expect(ends.sent).toHaveLength(2);
    });
    expect(ends.sent[0]).toEqual({ type: 'problem', reason: 'no-server' });
    expect(ends.sent[1]).toMatchObject({ provider: 'anthropic', missing: 'key', search: true });
    expect(stored.has('localServer')).toBe(false);
  });

  it('announces its state as it starts, for a panel that asked before it listened', async () => {
    const { host } = fakeHost();
    const { channel, sent } = fakeChannel();
    servePanel(host, channel, undefined, listing());
    await vi.waitFor(() => {
      expect(sent).toEqual([
        { type: 'state', provider: 'anthropic', model: '', missing: 'key', search: true },
      ]);
    });
    const broken = fakeHost();
    broken.host.settings.get.mockRejectedValueOnce(new Error('gone'));
    const other = fakeChannel();
    servePanel(broken.host, other.channel, undefined, listing());
    await vi.waitFor(() => {
      expect(other.sent).toEqual([
        { type: 'state', provider: '', model: '', missing: 'unavailable', search: false },
      ]);
    });
  });

  it('saves and forgets the chosen provider’s key, answering with the new state', async () => {
    const { host, secrets } = fakeHost({ settings: { provider: 'openai', model: 'gpt-x' } });
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends);
    channel.send({ type: 'save-key', key: 'sk-openai' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(secrets.get('apiKey.openai')).toBe('sk-openai');
    expect(sent[0]).toMatchObject({ provider: 'openai', missing: '' });
    channel.send({ type: 'forget-key' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(secrets.has('apiKey.openai')).toBe(false);
    channel.send({ type: 'state?' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(host.secrets.set).toHaveBeenCalledOnce();
  });

  it('ignores anything that is not a panel request, and names a failure’s kind', async () => {
    const { host } = fakeHost();
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends);
    channel.send({ type: 'send-message', text: 'hi' });
    host.chat.readActive.mockRejectedValueOnce({ kind: 'not-granted', message: 'no' });
    channel.send({ type: 'prepare' });
    await vi.waitFor(() => {
      expect(sent).toEqual([{ type: 'problem', reason: 'not-granted' }]);
    });
    host.settings.get.mockRejectedValueOnce(new Error('gone'));
    channel.send({ type: 'state?' });
    await vi.waitFor(() => {
      expect(sent.at(-1)).toEqual({ type: 'problem', reason: 'failed' });
    });
  });

  it('runs the reply flow: preview, allow, send, stop, use', async () => {
    const chat = { name: 'Team', group: true, messages: [{ outgoing: false, text: 'Lunch?' }] };
    const { host, secrets, drafts } = fakeHost({ chat });
    secrets.set('apiKey.anthropic', 'sk');
    const provider: Provider = {
      complete: vi.fn((_request, onText: (text: string) => void) => {
        onText('Sure!\nCan’t today');
        return Promise.resolve({ text: 'Sure!\nCan’t today', truncated: false });
      }),
    };
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends, () => provider);
    const next = async (data: unknown, count: number) => {
      channel.send(data);
      await vi.waitFor(() => {
        expect(sent.length).toBeGreaterThanOrEqual(count);
      });
      return sent.at(-1);
    };
    await expect(next({ type: 'prepare' }, 1)).resolves.toMatchObject({ allowed: false });
    await expect(next({ type: 'allow-chat', allowed: true }, 2)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(next({ type: 'send' }, 4)).resolves.toEqual({
      replace: false,
      type: 'suggestions',
      items: ['Sure!', 'Can’t today'],
    });
    channel.send({ type: 'cancel' });
    await expect(next({ type: 'use', index: 1 }, 5)).resolves.toEqual({ type: 'used' });
    expect(drafts).toEqual(['Can’t today']);
  });

  it('tells the panel a provider failure by its kind', async () => {
    const chat = { name: 'Team', group: false, messages: [] };
    const { host, secrets } = fakeHost({ chat });
    secrets.set('apiKey.anthropic', 'sk');
    const provider: Provider = {
      complete: vi.fn(() => Promise.reject(new ProviderError('rate-limited'))),
    };
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends, () => provider);
    channel.send({ type: 'prepare' });
    channel.send({ type: 'allow-chat', allowed: true });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    channel.send({ type: 'send' });
    await vi.waitFor(() => {
      expect(sent.at(-1)).toEqual({ type: 'problem', reason: 'rate-limited' });
    });
  });

  it('prepares a rewrite of the draft when the panel asks for one', async () => {
    const chat = { name: 'Team', group: false, messages: [] };
    const { host } = fakeHost({ chat });
    host.composer.readDraft.mockResolvedValue('see u');
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends);
    channel.send({ type: 'prepare-rewrite', style: 'formal', language: '' });
    channel.send({ type: 'allow-chat', allowed: true });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent.at(-1)).toMatchObject({ type: 'preview', allowed: true, transcript: 'see u' });
  });

  it('prepares a summary of the chat when the panel asks for one', async () => {
    const chat = { name: 'Team', group: false, messages: [{ outgoing: false, text: 'Lunch?' }] };
    const { host } = fakeHost({ chat });
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends);
    channel.send({ type: 'prepare-summary' });
    channel.send({ type: 'allow-chat', allowed: true });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent.at(-1)).toMatchObject({ type: 'preview', transcript: 'Chat: Team\nThem: Lunch?' });
  });
});
