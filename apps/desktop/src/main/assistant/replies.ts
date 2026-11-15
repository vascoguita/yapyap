import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';
import { cleanRewrite } from './rewrites.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

/** The model's answer when no reply makes sense. */
const NONE = 'NONE';

/**
 * What the model is asked for reply suggestions: replies that differ in
 * what they say, not just in wording, each one ready to send. A chat that
 * calls for no reply, such as one that ends in a link or a sticker, gets
 * none, so no row shows.
 */
export function suggestTask(now: Date): string {
  return [
    nowLine(now),
    `Suggest up to ${String(SUGGESTIONS)} replies I could send next in this chat.`,
    '- Answer what the others said since my last message; in a group, the message that most calls for my reply.',
    '- Make them really different from each other where the chat allows it, such as saying yes, saying no or not yet, and asking something back.',
    '- Each must be a whole message I could send as it is, about as long and as casual as my own messages here, in the language we write in.',
    'Write one reply per line, with no numbering, quotes or other text.',
    `If no reply makes sense, such as after a sticker, a link or a goodbye, answer only ${NONE}.`,
  ].join('\n');
}

/** Everything a request for reply suggestions in `chat` sends. */
export function suggestPrompt(chat: ReadChat, now: Date): Prompt {
  return { instructions: INSTRUCTIONS, context: chatContext(chat), task: suggestTask(now) };
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

/** The replies in the model's answer, at most {@link SUGGESTIONS}. */
export function suggestionsIn(answer: string): string[] {
  return answer
    .split('\n')
    .map(clean)
    .filter((line) => line !== '' && line.toUpperCase() !== NONE)
    .slice(0, SUGGESTIONS);
}
