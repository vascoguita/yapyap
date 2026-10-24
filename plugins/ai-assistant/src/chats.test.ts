import { describe, expect, it } from 'vitest';
import { chatKey, isAllowed, setAllowed } from './chats.ts';
import { fakeHost } from './testing/fake-host.ts';

describe('chats', () => {
  it('fingerprints chat names, so storage never holds them', async () => {
    expect(await chatKey('Ana')).toMatch(/^[0-9a-f]{64}$/);
    expect(await chatKey('Ana')).not.toBe(await chatKey('Ana B'));
  });

  it('allows the assistant chat by chat, and nowhere at first', async () => {
    const { host, stored } = fakeHost();
    expect(await isAllowed(host.storage, 'Ana')).toBe(false);
    await setAllowed(host.storage, 'Ana', true);
    await setAllowed(host.storage, 'Ana', true);
    await setAllowed(host.storage, 'Team', true);
    expect(await isAllowed(host.storage, 'Ana')).toBe(true);
    expect(stored.get('allowedChats')).toHaveLength(2);
    expect(JSON.stringify(stored.get('allowedChats'))).not.toContain('Ana');
    await setAllowed(host.storage, 'Ana', false);
    expect(await isAllowed(host.storage, 'Ana')).toBe(false);
    expect(await isAllowed(host.storage, 'Team')).toBe(true);
  });

  it('reads past anything odd in its storage, and remembers at most 500 chats', async () => {
    const { host, stored } = fakeHost();
    stored.set('allowedChats', 'not a list');
    expect(await isAllowed(host.storage, 'Ana')).toBe(false);
    stored.set('allowedChats', [7, await chatKey('Ana')]);
    expect(await isAllowed(host.storage, 'Ana')).toBe(true);
    stored.set(
      'allowedChats',
      Array.from({ length: 500 }, (_, i) => `k${String(i)}`),
    );
    await setAllowed(host.storage, 'Ana', true);
    const kept = stored.get('allowedChats') as string[];
    expect(kept).toHaveLength(500);
    expect(kept[0]).toBe('k1');
    expect(kept.at(-1)).toBe(await chatKey('Ana'));
  });
});
