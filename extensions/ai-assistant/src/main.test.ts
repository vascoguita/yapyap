import type { ExtensionHost } from '@yapyap/extension-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL } from './bus.ts';
import extension from './main.ts';

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
      storage: { get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(), delete: vi.fn() },
      assistant: { offer: vi.fn(), onRequest: vi.fn() },
    } as unknown as ExtensionHost;
    extension.activate(host);
    const panel = new BroadcastChannel(CHANNEL);
    opened.push(panel);
    const answer = new Promise<unknown>((resolve) => {
      panel.onmessage = (event) => {
        resolve(event.data);
      };
    });
    panel.postMessage({ type: 'state?' });
    await expect(answer).resolves.toMatchObject({ type: 'state', missing: 'key' });
    expect(host.assistant.onRequest).toHaveBeenCalledOnce();
  });
});
