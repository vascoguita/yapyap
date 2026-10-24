import { describe, expect, it, vi } from 'vitest';
import { servePanel, stateOf, type Channel } from './assistant.ts';

function fakeHost(values: Record<string, string> = {}) {
  const secrets = new Map<string, string>();
  return {
    secrets: {
      get: vi.fn((name: string) => Promise.resolve(secrets.get(name))),
      set: vi.fn((name: string, value: string) => {
        secrets.set(name, value);
        return Promise.resolve();
      }),
      delete: vi.fn((name: string) => {
        secrets.delete(name);
        return Promise.resolve();
      }),
    },
    settings: { get: vi.fn(() => Promise.resolve(values)) },
    stored: secrets,
  };
}

function fakeChannel() {
  const sent: unknown[] = [];
  const channel: Channel & { send: (data: unknown) => void } = {
    onmessage: null,
    postMessage: (message) => sent.push(message),
    send: (data) => channel.onmessage?.({ data } as MessageEvent),
  };
  return { channel, sent };
}

describe('stateOf', () => {
  it('says what is missing, never the key', async () => {
    const host = fakeHost();
    await expect(stateOf(host)).resolves.toEqual({
      type: 'state',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      missing: 'key',
    });
    host.stored.set('apiKey.anthropic', 'sk-secret');
    const state = await stateOf(host);
    expect(state.missing).toBe('');
    expect(JSON.stringify(state)).not.toContain('sk-secret');
  });
});

describe('servePanel', () => {
  it('saves and forgets the chosen provider’s key, answering with the new state', async () => {
    const host = fakeHost({ provider: 'openai', model: 'gpt-x' });
    const { channel, sent } = fakeChannel();
    servePanel(host, channel);
    // It announces its state at once, for a panel that asked before it was listening.
    await vi.waitFor(() => {
      expect(sent).toEqual([{ type: 'state', provider: 'openai', model: 'gpt-x', missing: 'key' }]);
    });
    channel.send({ type: 'save-key', key: 'sk-openai' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(host.stored.get('apiKey.openai')).toBe('sk-openai');
    expect(sent[1]).toMatchObject({ provider: 'openai', missing: '' });
    channel.send({ type: 'forget-key' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(host.stored.has('apiKey.openai')).toBe(false);
    channel.send({ type: 'state?' });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(4);
    });
    expect(host.secrets.set).toHaveBeenCalledOnce();
  });

  it('ignores anything that is not a panel request, and tells the panel when the host fails', async () => {
    const host = fakeHost();
    const { channel, sent } = fakeChannel();
    host.settings.get.mockRejectedValueOnce(new Error('gone'));
    servePanel(host, channel);
    channel.send({ type: 'send', text: 'hi' });
    const unavailable = { type: 'state', provider: '', model: '', missing: 'unavailable' };
    await vi.waitFor(() => {
      expect(sent).toEqual([unavailable]);
    });
    host.settings.get.mockRejectedValueOnce(new Error('gone'));
    channel.send({ type: 'state?' });
    await vi.waitFor(() => {
      expect(sent).toEqual([unavailable, unavailable]);
    });
  });
});
