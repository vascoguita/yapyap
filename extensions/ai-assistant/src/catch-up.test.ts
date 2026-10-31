import { describe, expect, it, vi } from 'vitest';
import { unreadDigest } from './catch-up.ts';

const reader = (read: () => Promise<unknown>) => ({ readUnreadSummary: vi.fn(read) }) as never;

describe('unreadDigest', () => {
  it('writes each unread chat’s name, count and latest message, top first', async () => {
    const chats = [
      { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Lunch at 1?' }] },
      { name: 'Team', unread: 14, messages: [] },
    ];
    expect(await unreadDigest(reader(() => Promise.resolve(chats)))).toEqual({
      text: [
        'Chat: Ana',
        'Unread: 2',
        'Latest message: Lunch at 1?',
        '',
        'Chat: Team',
        'Unread: 14',
        'Latest message: (no text)',
      ].join('\n'),
    });
  });

  it('says when no chat is unread, or YapYap does not let it see them', async () => {
    expect(await unreadDigest(reader(() => Promise.resolve([])))).toEqual({ reason: 'no-unread' });
    const refused = Object.assign(new Error('no'), { kind: 'not-granted' });
    expect(await unreadDigest(reader(() => Promise.reject(refused)))).toEqual({
      reason: 'unread-not-granted',
    });
  });

  it('passes any other failure on', async () => {
    const busy = Object.assign(new Error('busy'), { kind: 'rate-limited' });
    await expect(unreadDigest(reader(() => Promise.reject(busy)))).rejects.toBe(busy);
    await expect(unreadDigest(reader(() => Promise.reject(new Error('gone'))))).rejects.toThrow(
      'gone',
    );
  });
});
