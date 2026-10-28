import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import { readOpenChat } from './chat-reading.ts';

const page = (found: unknown) => ({
  executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve(found)),
});

describe('readOpenChat', () => {
  it('asks the adapter for the last messages, and passes on what it checked', async () => {
    const chat = { name: 'Team', group: true, messages: [{ outgoing: true, text: 'On my way' }] };
    const open = page(chat);
    await expect(readOpenChat(open, 5)).resolves.toEqual(chat);
    const [world, scripts] = open.executeJavaScriptInIsolatedWorld.mock.lastCall as unknown as [
      number,
      { code: string }[],
    ];
    expect(world).toBe(ADAPTER_WORLD_ID);
    expect(scripts[0]?.code).toContain('"messages":5');
    await expect(readOpenChat(page(null), 5)).resolves.toBeNull();
  });

  it('fails rather than pass on something else the page returned', async () => {
    await expect(readOpenChat(page({ html: '<b>hi</b>' }), 5)).rejects.toThrow(
      'The open chat could not be read.',
    );
  });
});
