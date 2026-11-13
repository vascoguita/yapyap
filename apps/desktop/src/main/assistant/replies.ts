import type { ReadChat } from '../../adapter/active-chat.ts';
import type { CompletionRequest } from './providers/provider.ts';
import { cleanRewrite } from './rewrites.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

/** The model's answer when no reply makes sense. */
const NONE = 'NONE';

/**
 * What the model is asked for reply suggestions. A chat that calls for no
 * reply, such as one that ends in a link or a sticker, gets none, so no
 * row shows.
 */
export const INSTRUCTIONS = [
  'You help someone reply in a WhatsApp chat.',
  `Suggest up to ${String(SUGGESTIONS)} short, different replies they could send next,`,
  'in the language and tone of the chat.',
  'Write one reply per line, with no numbering, quotes or other text.',
  `If no reply makes sense, such as after a link or a sticker, answer only ${NONE}.`,
].join(' ');

/**
 * The chat as the model reads it: the last `context` messages, each marked
 * as the user's or the other side's. This text, with the instructions, is
 * exactly what is sent (#107).
 */
export function transcriptOf(chat: ReadChat, context: number): string {
  const lines = chat.messages
    .slice(-context)
    .map(({ outgoing, text }) => `${outgoing ? 'Me' : 'Them'}: ${text}`);
  return [`Chat: ${chat.name}`, ...lines].join('\n');
}

/** The request: the instructions, and the text as the user's turn. */
export function requestFor(
  instructions: string,
  text: string,
  signal?: AbortSignal,
): CompletionRequest {
  return {
    instructions,
    turns: [{ role: 'user', text }],
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Numbering or a bullet a model may put before a reply despite being asked not to. */
const MARKER = /^(?:\d{1,2}[.)]|[-*•])\s*/;
/**
 * The transcript's own label, which small models such as the private one
 * (#457) repeat before a reply as if it were part of it.
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
