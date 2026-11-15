import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from './prompts.ts';
import { suggestionsIn, suggestPrompt, suggestTask } from './replies.ts';

const NOW = new Date(2026, 10, 15, 14, 3);

describe('suggestTask', () => {
  it('asks for up to three different, ready-to-send replies, one per line, or NONE', () => {
    const task = suggestTask(NOW);
    expect(task).toMatch(/^It is now Sunday, 15 November 2026 at 14:03, the user’s time\./);
    expect(task).toContain('Suggest up to 3 replies I could send next');
    expect(task).toContain('really different from each other');
    expect(task).toContain('as long and as casual as my own messages');
    expect(task).toContain('one reply per line');
    expect(task).toContain('answer only NONE');
  });
});

describe('suggestPrompt', () => {
  it('sends the shared instructions, the chat, then the task', () => {
    const chat = { name: 'Ana', group: false, messages: [{ outgoing: false, text: 'Hi' }] };
    expect(suggestPrompt(chat, NOW)).toEqual({
      instructions: INSTRUCTIONS,
      context: '<chat>\nThis is a chat with Ana.\nAna: Hi\n</chat>',
      task: suggestTask(NOW),
    });
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
    expect(suggestionsIn('Me: Ready at 8.\n- me: “On my way”')).toEqual([
      'Ready at 8.',
      'On my way',
    ]);
    expect(suggestionsIn('\n  \n')).toEqual([]);
  });

  it('takes no reply from a model that found none to make', () => {
    expect(suggestionsIn('NONE')).toEqual([]);
    expect(suggestionsIn(' “None” ')).toEqual([]);
    expect(suggestionsIn('None of that\nNONE')).toEqual(['None of that']);
  });
});
