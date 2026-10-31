import { describe, expect, it, vi } from 'vitest';
import { servePanel, stateOf, type Channel } from './assistant.ts';
import type { LocalView, Update } from './bus.ts';
import { currentSetup } from './models.ts';
import { ProviderError, type Provider } from './providers/provider.ts';
import { fakeHost } from './testing/fake-host.ts';
import { fakeLocal, type FakeLocal } from './testing/local.ts';
import { listing } from './testing/models.ts';

/** The panel's end: what it was told about the private model apart from everything else. */
function fakeChannel() {
  const sent: Update[] = [];
  const locals: LocalView[] = [];
  const channel: Channel & { send: (data: unknown) => void } = {
    onmessage: null,
    postMessage: (message) => {
      if (message.type === 'local') {
        locals.push(message);
      } else {
        sent.push(message);
      }
    },
    send: (data) => channel.onmessage?.({ data } as MessageEvent),
  };
  return { channel, sent, locals };
}

describe('stateOf', () => {
  it('says what is missing, never the key', async () => {
    const { host, secrets } = fakeHost();
    const list = listing();
    expect(stateOf(await currentSetup(host, list))).toEqual({
      type: 'state',
      provider: 'anthropic',
      model: '',
      missing: 'key',
      search: true,
    });
    expect(list).not.toHaveBeenCalled();
    secrets.set('apiKey.anthropic', 'sk-secret');
    const state = stateOf(await currentSetup(host, list));
    // Auto picks the newest of Claude's quick models.
    expect(state).toMatchObject({ model: 'claude-haiku-5-5', missing: '' });
    expect(JSON.stringify(state)).not.toContain('sk-secret');
  });
});

/** Serves the panel, then forgets the state this page announces as it starts. */
async function serve(
  host: Parameters<typeof servePanel>[0],
  { channel, sent, locals }: ReturnType<typeof fakeChannel>,
  make: () => Provider = () => ({ complete: vi.fn() }),
  local: FakeLocal = fakeLocal(),
): Promise<void> {
  servePanel(host, channel, local.local, { make, list: listing() });
  await vi.waitFor(() => {
    expect(locals).toHaveLength(1);
  });
  locals.length = 0;
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
    servePanel(host, channel, fakeLocal().local, { list: listing() });
    await vi.waitFor(() => {
      expect(sent).toEqual([
        { type: 'state', provider: 'anthropic', model: '', missing: 'key', search: true },
      ]);
    });
    const broken = fakeHost();
    broken.host.settings.get.mockRejectedValueOnce(new Error('gone'));
    const other = fakeChannel();
    servePanel(broken.host, other.channel, fakeLocal().local);
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
    // The answer names the request, so the panel stops sending it again.
    expect(sent[0]).toMatchObject({ provider: 'openai', missing: '', answers: 'save-key' });
    channel.send({ type: 'forget-key' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(secrets.has('apiKey.openai')).toBe(false);
    expect(sent[1]).toMatchObject({ answers: 'forget-key' });
    channel.send({ type: 'state?' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(sent[2]).not.toHaveProperty('answers');
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

  it('tells the new state once YapYap’s own rate lets it, so the panel never shows the old one', async () => {
    const { host } = fakeHost();
    const ends = fakeChannel();
    const { channel, sent } = ends;
    await serve(host, ends);
    host.settings.get.mockRejectedValueOnce({ kind: 'rate-limited', message: 'too often' });
    channel.send({ type: 'state?' });
    await vi.waitFor(
      () => {
        expect(sent).toEqual([
          { type: 'state', provider: 'anthropic', model: '', missing: 'key', search: true },
        ]);
      },
      { timeout: 3000 },
    );
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

  it('offers the private model to someone who set nothing up, and runs its buttons', async () => {
    const { host } = fakeHost();
    const model = fakeLocal();
    const ends = fakeChannel();
    servePanel(host, ends.channel, model.local, { list: listing() });
    await vi.waitFor(() => {
      expect(ends.locals).toHaveLength(1);
    });
    expect(ends.locals[0]).toEqual({
      type: 'local',
      status:
        'Use a private model on this computer (about 1.1 GB, downloaded once)? Your messages never leave it.',
      label: 'Use a private model',
      action: 'download',
      used: 0,
      model: 'Qwen2.5 1.5B',
    });
    for (const [type, method] of [
      ['download-model', 'download'],
      ['smaller-model', 'smaller'],
      ['remove-model', 'remove'],
    ] as const) {
      ends.channel.send({ type });
      await vi.waitFor(() => {
        expect(model.local[method]).toHaveBeenCalledOnce();
      });
    }
    await vi.waitFor(() => {
      expect(ends.locals).toHaveLength(4);
    });
    // Someone with a key is not offered it.
    const other = fakeHost();
    other.secrets.set('apiKey.anthropic', 'sk');
    const otherEnds = fakeChannel();
    servePanel(other.host, otherEnds.channel, fakeLocal().local, { list: listing() });
    await vi.waitFor(() => {
      expect(otherEnds.locals).toEqual([
        { type: 'local', status: '', label: '', action: '', used: 0, model: 'Qwen2.5 1.5B' },
      ]);
    });
  });

  it('passes the download’s progress on as it comes, with the space the model takes', async () => {
    const { host } = fakeHost({ settings: { provider: 'built-in' } });
    const model = fakeLocal();
    const ends = fakeChannel();
    await serve(host, ends, undefined, model);
    model.used.bytes = 450_000_000;
    model.tell({ kind: 'downloading', done: 450_000_000 });
    await vi.waitFor(() => {
      expect(ends.locals).toEqual([
        expect.objectContaining({
          status: 'Downloading the private model: 40% (450 of 1,117 MB)',
          used: 450_000_000,
        }),
      ]);
    });
    // A store that cannot be read leaves the panel as it was.
    model.local.used.mockRejectedValueOnce(new Error('gone'));
    model.tell({ kind: 'warming' });
    model.tell({ kind: 'ready' });
    await vi.waitFor(() => {
      expect(ends.locals).toHaveLength(2);
    });
    expect(ends.locals[1]?.status).toBe(
      'The private model is ready. Your messages stay on this computer.',
    );
  });

  it('names the private model plainly in its state, without its name', async () => {
    const { host, stored } = fakeHost();
    stored.set('builtIn', { model: 'qwen', name: 'Qwen2.5 1.5B', ready: true });
    expect(stateOf(await currentSetup(host, listing([{ id: 'qwen', label: 'Private' }])))).toEqual({
      type: 'state',
      provider: 'built-in',
      model: '',
      missing: '',
      search: false,
    });
  });
});
