import type { PluginHost } from '@yapyap/plugin-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL } from './bus.ts';
import plugin from './main.ts';

const opened: BroadcastChannel[] = [];

afterEach(() => {
  for (const channel of opened.splice(0)) {
    channel.close();
  }
});

describe('the AI assistant’s hidden page', () => {
  it('answers its panel over the shared channel', async () => {
    const host = {
      settings: { get: vi.fn(() => Promise.resolve({})) },
      secrets: { get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(), delete: vi.fn() },
    } as unknown as PluginHost;
    plugin.activate(host);
    const panel = new BroadcastChannel(CHANNEL);
    opened.push(panel);
    const answer = new Promise<unknown>((resolve) => {
      panel.onmessage = (event) => {
        resolve(event.data);
      };
    });
    panel.postMessage({ type: 'state?' });
    await expect(answer).resolves.toMatchObject({ type: 'state', missing: 'key' });
  });
});
