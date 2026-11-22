import type { Quote, ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, INSTRUCTIONS, nowLine, quotation, type Prompt } from './prompts.ts';
import { cleanRewrite } from './rewrites.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

/** What a model may still answer when it finds no reply, as it was once asked to. */
const NONE = 'NONE';

/**
 * What the model is asked for: the next message in the chat, or, when the
 * user chose a message to reply to, replies to that one (#740). It is in
 * the task, not the chat, so choosing a message leaves the cached chat as
 * it was.
 */
function askFor(replyingTo: Quote | undefined): string[] {
  const count = String(SUGGESTIONS);
  if (replyingTo === undefined) {
    return [
      `Suggest ${count} messages I could send next in this chat, as "Suggesting replies" describes them.`,
    ];
  }
  return [
    'I am replying to this message of the chat:',
    '<reply-to>',
    quotation(replyingTo),
    '</reply-to>',
    `Suggest ${count} replies to it I could send, as "Suggesting replies" describes them.`,
  ];
}

/**
 * What the model is asked for reply suggestions, as the instructions
 * describe them: real choices, each ready to send, whatever the chat ends
 * in and whoever sent it, so the row always has something (#723).
 */
export function suggestTask(now: Date, replyingTo?: Quote): string {
  return [
    nowLine(now),
    ...askFor(replyingTo),
    'Write each message on a line of its own between <reply> and </reply>, and nothing else: no reasons, notes or numbering.',
  ].join('\n');
}

/** Everything a request for reply suggestions in `chat` sends, for the message the user replies to if any. */
export function suggestPrompt(chat: ReadChat, now: Date): Prompt {
  return {
    instructions: INSTRUCTIONS,
    context: chatContext(chat),
    task: suggestTask(now, chat.replyingTo),
  };
}

/** Numbering or a bullet a model may put before a reply despite being asked not to. */
const MARKER = /^(?:\d{1,2}[.)]|[-*•])\s*/;
/**
 * The transcript's own label for the user, which small models repeat
 * before a reply as if it were part of it.
 */
const SPEAKER = /^Me:\s*/i;

const clean = (line: string): string =>
  cleanRewrite(line.trim().replace(MARKER, '').replace(SPEAKER, ''));

/** A reply as the model is asked to fence it; one spread over lines is still one reply. */
const TAGGED = /<reply>([\s\S]*?)<\/reply>/gi;

/**
 * What the model offered as replies: the fenced ones, and anything else it
 * wrote left out, as a model may say first why it chose them, which showed
 * as a reply to send. A model that fences none still gets its lines read,
 * the last ones, after any such reasons.
 */
function offered(answer: string): string[] {
  const fenced = Array.from(answer.matchAll(TAGGED), ([, reply]) =>
    String(reply)
      .split('\n')
      .map((part) => part.trim())
      .join(' '),
  );
  return fenced.length > 0 ? fenced : answer.split('\n');
}

/** The replies in the model's answer, at most {@link SUGGESTIONS}. */
export function suggestionsIn(answer: string): string[] {
  return offered(answer)
    .map(clean)
    .filter((line) => line !== '' && line.toUpperCase() !== NONE)
    .slice(-SUGGESTIONS);
}
