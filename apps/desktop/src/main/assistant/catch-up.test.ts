import { describe, expect, it } from 'vitest';
import { CATCH_UP_INSTRUCTIONS, digestOf } from './catch-up.ts';

describe('digestOf', () => {
  it('writes each unread chat’s name, count and latest message, top first', () => {
    const chats = [
      { name: 'Ana', unread: 2, messages: [{ outgoing: false, text: 'Lunch at 1?' }] },
      { name: 'Team', unread: 14, messages: [] },
    ];
    expect(digestOf(chats)).toBe(
      [
        'Chat: Ana',
        'Unread: 2',
        'Latest message: Lunch at 1?',
        '',
        'Chat: Team',
        'Unread: 14',
        'Latest message: (no text)',
      ].join('\n'),
    );
    expect(CATCH_UP_INSTRUCTIONS).toContain('only the latest one');
  });
});
