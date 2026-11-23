import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';

/**
 * The most points a summary shows, and the most words in each, as the
 * model is asked: about eight lines, which the box shows whole, without
 * scrolling.
 */
const MAX_POINTS = 4;
const MAX_WORDS = 15;
/** The longest point shown; a longer one is cut. */
const MAX_POINT = 500;

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
    `Summarize them for me as "Summarizing unread messages" describes, in at most ${String(MAX_POINTS)} points of at most ${String(MAX_WORDS)} words each, fewer when there is less to say, each on a line of its own between <summary> and </summary>, and write nothing else.`,
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

/** A point as plain text: no marker before it, no emphasis in it, and not too long. */
const plain = (line: string): string =>
  line.trim().replace(MARKER, '').replaceAll(EMPHASIS, '$1$3').trim().slice(0, MAX_POINT);

/** The fenced summary in the model's answer. */
const FENCED = /<summary>([\s\S]*?)<\/summary>/gi;

/**
 * The points of the summary in the model's answer, one a line, as plain
 * text; anything outside the fence is left out, as a model may first say
 * what it is about to do. None when it fenced none.
 */
export const summaryIn = (answer: string): string[] =>
  Array.from(answer.matchAll(FENCED), ([, inner]) => String(inner))
    .join('\n')
    .split('\n')
    .map(plain)
    .filter((line) => line !== '')
    .slice(0, MAX_POINTS);
