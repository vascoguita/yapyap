import type { ActiveChat } from '@yapyap/plugin-sdk';
import type { CompletionRequest } from './providers/provider.ts';

/** How many replies the assistant offers to choose from. */
const SUGGESTIONS = 3;

export const INSTRUCTIONS = [
  'You help someone reply in a WhatsApp chat.',
  `Suggest ${String(SUGGESTIONS)} short, different replies they could send next,`,
  'in the language and tone of the chat.',
  'Write one reply per line, with no numbering, quotes or other text.',
].join(' ');

/**
 * The chat as the model reads it: the last `context` messages, each marked
 * as the user's or the other side's. This text, with the instructions, is
 * exactly what the panel shows before anything is sent (#107).
 */
export function transcriptOf(chat: ActiveChat, context: number): string {
  const lines = chat.messages
    .slice(-context)
    .map(({ outgoing, text }) => `${outgoing ? 'Me' : 'Them'}: ${text}`);
  return [`Chat: ${chat.name}`, ...lines].join('\n');
}

/** The request for reply suggestions, from what the panel showed. */
export function replyRequest(transcript: string, signal?: AbortSignal): CompletionRequest {
  return {
    instructions: INSTRUCTIONS,
    turns: [{ role: 'user', text: transcript }],
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Numbering or a bullet a model may put before a reply despite being asked not to. */
const MARKER = /^(?:\d{1,2}[.)]|[-*•])\s*/;
/** Quotes around a reply. */
const QUOTES = /^["“”']|["“”']$/g;

const clean = (line: string): string =>
  line.trim().replace(MARKER, '').replaceAll(QUOTES, '').trim();

/** The replies in the model's answer, at most {@link SUGGESTIONS}. */
export function suggestionsIn(answer: string): string[] {
  return answer
    .split('\n')
    .map(clean)
    .filter((line) => line !== '')
    .slice(0, SUGGESTIONS);
}
