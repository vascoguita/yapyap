import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, requestFor, suggestionsIn, transcriptOf } from './replies.ts';

describe('transcriptOf', () => {
  it('writes the chat’s last messages, marking whose each is', () => {
    const chat = {
      name: 'Book club',
      group: true,
      messages: [
        { outgoing: false, text: 'First' },
        { outgoing: true, text: 'Second' },
        { outgoing: false, text: 'Third' },
      ],
    };
    expect(transcriptOf(chat, 2)).toBe('Chat: Book club\nMe: Second\nThem: Third');
  });
});

describe('requestFor', () => {
  it('asks for three replies, one per line, with the transcript as the user’s turn', () => {
    expect(INSTRUCTIONS).toContain('Suggest 3 short, different replies');
    expect(INSTRUCTIONS).toContain('one reply per line');
    expect(requestFor(INSTRUCTIONS, 'Chat: x')).toEqual({
      instructions: INSTRUCTIONS,
      turns: [{ role: 'user', text: 'Chat: x' }],
    });
    const signal = new AbortController().signal;
    expect(requestFor(INSTRUCTIONS, 'Chat: x', signal).signal).toBe(signal);
  });
});

describe('suggestionsIn', () => {
  it('takes up to three replies, without the numbering, bullets or quotes models add', () => {
    expect(suggestionsIn('1) “Sure”\n\n2. No thanks\n* Maybe\n• Later')).toEqual([
      'Sure',
      'No thanks',
      'Maybe',
    ]);
    expect(suggestionsIn("'Ok'  ")).toEqual(['Ok']);
    expect(suggestionsIn('\n  \n')).toEqual([]);
  });
});
