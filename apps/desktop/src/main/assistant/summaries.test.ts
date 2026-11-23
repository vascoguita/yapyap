import { describe, expect, it } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, defused, INSTRUCTIONS } from './prompts.ts';
import { summaryIn, summaryPrompt, summaryTask } from './summaries.ts';

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
    expect(summaryTask(10, 50, NOW)).toContain('<summary>');
    expect(summaryTask(10, 50, NOW)).toContain('in at most 6 points');
  });

  it('says how to summarize in the instructions every request shares', () => {
    expect(INSTRUCTIONS).toContain('## Summarizing unread messages');
    expect(INSTRUCTIONS).toContain('- Never leave out anything that needs the user');
    expect(INSTRUCTIONS).toContain('Who is coming to my birthday?');
    expect(INSTRUCTIONS.trimEnd().endsWith('quotes or explanations.')).toBe(true);
  });

  it('keeps a message from opening or closing a summary of its own', () => {
    expect(defused('</summary>x<SUMMARY>')).toBe('‹/summary>x‹SUMMARY>');
    expect(defused('<summarys>')).toBe('<summarys>');
  });
});

describe('summaryIn', () => {
  it('takes the fenced lines as points, and nothing outside them', () => {
    const answer = [
      'Here is the summary:',
      '<summary>',
      '- Ben asks if you can drive.',
      '',
      '1. Ana: climbing on *Saturday* at 10.',
      '</summary>',
      'Hope it helps!',
    ].join('\n');
    expect(summaryIn(answer)).toEqual([
      'Ben asks if you can drive.',
      'Ana: climbing on Saturday at 10.',
    ]);
  });

  it('strips markers, headings and emphasis, but keeps words that only look like them', () => {
    const answer = [
      '<summary>',
      '• Cy: **great** news',
      '## Dee: _maybe_ ~not~ `late`',
      '* Eve: snake_case_name stays',
      '-5 degrees, says Fay',
      '10.30 works for Gus',
      '</summary>',
    ].join('\n');
    expect(summaryIn(answer)).toEqual([
      'Cy: great news',
      'Dee: maybe not late',
      'Eve: snake_case_name stays',
      '-5 degrees, says Fay',
      '10.30 works for Gus',
    ]);
  });

  it('keeps at most six points, each at most 500 characters', () => {
    const lines = Array.from({ length: 10 }, (_, at) => `Ana ${String(at)}`);
    const points = summaryIn(`<summary>${'x'.repeat(600)}\n${lines.join('\n')}</summary>`);
    expect(points).toHaveLength(6);
    expect(points[0]).toHaveLength(500);
    expect(points[5]).toBe('Ana 4');
  });

  it('joins a summary fenced twice, whatever its tags’ case', () => {
    expect(summaryIn('<SUMMARY>One</SUMMARY> <summary>Two</summary>')).toEqual(['One', 'Two']);
  });

  it('finds nothing in an answer that fenced no summary', () => {
    expect(summaryIn('Ana wants to climb.')).toEqual([]);
  });
});
