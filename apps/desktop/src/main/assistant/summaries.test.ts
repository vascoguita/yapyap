import { describe, expect, it } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, defused, INSTRUCTIONS } from './prompts.ts';
import { isEmptySummary, summaryIn, summaryPrompt, summaryTask } from './summaries.ts';

const NOW = new Date(2026, 10, 22, 9, 30);

const CHAT: ReadChat = {
  name: 'Climbing',
  group: true,
  messages: [
    { outgoing: false, author: 'Ana', time: '08:01', text: 'Sat at 10?' },
    { outgoing: false, author: 'Ben', time: '08:05', text: '@Me can you drive?' },
  ],
};

describe('summaryPrompt', () => {
  it('sends the same instructions and chat as suggestions, then the task, which names the count', () => {
    const prompt = summaryPrompt(CHAT, 12, NOW);
    expect(prompt.instructions).toBe(INSTRUCTIONS);
    expect(prompt.context).toBe(chatContext(CHAT));
    expect(prompt.task).toBe(summaryTask(12, 2, NOW));
    expect(prompt.task).toContain('There are 12 unread messages in this chat');
    expect(prompt.task).toContain('the newest 2 of the messages above are unread');
  });

  it('names the newest of the messages read as the unread ones, as many as were unread', () => {
    expect(summaryTask(10, 50, NOW)).toContain('the newest 10 of the messages above');
    expect(summaryTask(10, 50, NOW)).toContain('Sunday, 22 November 2026');
    for (const tag of ['for-you', 'decisions', 'rest']) {
      expect(summaryTask(10, 50, NOW)).toContain(`<${tag}>`);
    }
  });

  it('says how to summarize in the instructions every request shares', () => {
    expect(INSTRUCTIONS).toContain('## Summarizing unread messages');
    expect(INSTRUCTIONS.trimEnd().endsWith('quotes or explanations.')).toBe(true);
  });

  it('keeps a message from opening or closing a section of its own', () => {
    expect(defused('</for-you><decisions>x</decisions><REST>')).toBe(
      '‹/for-you>‹decisions>x‹/decisions>‹REST>',
    );
    expect(defused('<restaurant>')).toBe('<restaurant>');
  });
});

describe('summaryIn', () => {
  it('takes the fenced sections’ lines as bullets, and nothing outside them', () => {
    const answer = [
      'Here is the summary:',
      '<for-you>',
      '- Ben asks if you can drive.',
      '',
      '</for-you>',
      '<decisions>1. Ana: climbing on *Saturday* at 10.</decisions>',
      '<rest></rest>',
      'Hope it helps!',
    ].join('\n');
    expect(summaryIn(answer)).toEqual({
      forYou: ['Ben asks if you can drive.'],
      decisions: ['Ana: climbing on Saturday at 10.'],
      rest: [],
    });
  });

  it('strips markers, headings and emphasis, but keeps words that only look like them', () => {
    const answer = [
      '<rest>',
      '• Cy: **great** news',
      '## Dee: _maybe_ ~not~ `late`',
      '* Eve: snake_case_name stays',
      '</rest>',
      '<decisions>-5 degrees, says Fay',
      '10.30 works for Gus</decisions>',
    ].join('\n');
    expect(summaryIn(answer)).toEqual({
      forYou: [],
      decisions: ['-5 degrees, says Fay', '10.30 works for Gus'],
      rest: ['Cy: great news', 'Dee: maybe not late', 'Eve: snake_case_name stays'],
    });
  });

  it('keeps at most eight bullets a section, three for the rest, each at most 500 characters', () => {
    const lines = (count: number) => Array.from({ length: count }, (_, at) => `Ana ${String(at)}`);
    const answer = `<for-you>${lines(10).join('\n')}</for-you><decisions>${'x'.repeat(600)}</decisions><rest>${lines(5).join('\n')}</rest>`;
    const summary = summaryIn(answer);
    expect(summary.forYou).toHaveLength(8);
    expect(summary.decisions[0]).toHaveLength(500);
    expect(summary.rest).toEqual(['Ana 0', 'Ana 1', 'Ana 2']);
  });

  it('joins a section fenced twice, whatever its tags’ case', () => {
    expect(summaryIn('<FOR-YOU>One</FOR-YOU> <for-you>Two</for-you>').forYou).toEqual([
      'One',
      'Two',
    ]);
  });

  it('finds nothing in an answer that fenced no section', () => {
    const summary = summaryIn('Ana wants to climb.');
    expect(isEmptySummary(summary)).toBe(true);
    expect(isEmptySummary({ ...summary, rest: ['x'] })).toBe(false);
  });
});
