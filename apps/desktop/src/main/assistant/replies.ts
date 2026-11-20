import type { ReadChat } from '../../adapter/active-chat.ts';
import { chatContext, INSTRUCTIONS, nowLine, type Prompt } from './prompts.ts';
import { cleanRewrite } from './rewrites.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

/** What a model may still answer when it finds no reply, as it was once asked to. */
const NONE = 'NONE';

/**
 * What the model is asked for reply suggestions, as the instructions
 * describe them: real choices, each ready to send, whatever the chat ends
 * in and whoever sent it, so the row always has something (#723).
 */
export function suggestTask(now: Date): string {
  return [
    nowLine(now),
    `Suggest ${String(SUGGESTIONS)} messages I could send next in this chat, as "Suggesting replies" describes them.`,
    'Write one message per line, with no numbering, quotes or other text.',
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
