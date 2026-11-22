import type { ReadChat } from '../../adapter/active-chat.ts';
import type { SummarySections } from '../../shared/api/assistant-bar-api.ts';
import { chatContext, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';

/** The most bullets a section shows; the model is asked for few. */
const MAX_BULLETS = 8;
/** The most bullets "Everything else" shows, as the model is asked. */
const MAX_REST = 3;
/** The longest bullet shown; a longer one is cut. */
const MAX_BULLET = 500;

/**
 * What the model is asked for a summary of the `count` unread messages,
 * of which the chat holds the newest `read`: the history limit may read
 * fewer messages than were unread, and the model is told which of them are
 * unread, as the chat does not mark them.
 */
export function summaryTask(count: number, read: number, now: Date): string {
  const newest = String(Math.min(count, read));
  return [
    nowLine(now),
    `There are ${String(count)} unread messages in this chat: the newest ${newest} of the messages above are unread.`,
    'Summarize them for me as "Summarizing unread messages" describes, in three sections, each point on a line of its own:',
    '<for-you>messages that mention me, reply to or quote my messages, or ask me something</for-you>',
    '<decisions>decisions, dates, times and tasks</decisions>',
    '<rest>everything else, in at most three lines</rest>',
    'Leave a section empty when nothing belongs in it, and write nothing outside the sections.',
  ].join('\n');
}

/**
 * Everything a request for a summary of the `count` messages `chat` opened
 * with unread sends: the same instructions and chat as suggestions, so a
 * provider reads them from its cache, then the task.
 */
export function summaryPrompt(chat: ReadChat, count: number, now: Date): Prompt {
  return {
    instructions: INSTRUCTIONS,
    context: chatContext(chat),
    task: summaryTask(count, chat.messages.length, now),
  };
}

/** Numbering, a bullet or a heading a model may put before a line despite being asked for plain text. */
const MARKER = /^(?:\d{1,2}[.)]\s+|[-*•–]\s+|#{1,6}\s+)/;
/** Markdown's or WhatsApp's emphasis around words, which shows as text. */
const EMPHASIS = /(^|[\s(])(\*\*|__|[*_~`])(\S|\S.*?\S)\2(?=$|[\s).,!?:;])/g;

/** A line of a section as plain text: no marker before it, no emphasis in it, and not too long. */
const plain = (line: string): string =>
  line.trim().replace(MARKER, '').replaceAll(EMPHASIS, '$1$3').trim().slice(0, MAX_BULLET);

/**
 * The lines the model fenced in `tag`'s sections, as bullets; anything
 * outside them is left out, as a model may first say what it is about to do.
 */
function bulletsIn(answer: string, tag: string): string[] {
  const fenced = new RegExp(String.raw`<${tag}>([\s\S]*?)</${tag}>`, 'gi');
  return Array.from(answer.matchAll(fenced), ([, inner]) => String(inner))
    .join('\n')
    .split('\n')
    .map(plain)
    .filter((line) => line !== '');
}

/** The summary in the model's answer, by section; every section is empty when it fenced none. */
export function summaryIn(answer: string): SummarySections {
  return {
    forYou: bulletsIn(answer, 'for-you').slice(0, MAX_BULLETS),
    decisions: bulletsIn(answer, 'decisions').slice(0, MAX_BULLETS),
    rest: bulletsIn(answer, 'rest').slice(0, MAX_REST),
  };
}

/** Whether a summary has nothing to show. */
export const isEmptySummary = ({ forYou, decisions, rest }: SummarySections): boolean =>
  forYou.length + decisions.length + rest.length === 0;
