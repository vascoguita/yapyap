import type { UnreadSummaryChat } from '../../adapter/unread-summary.ts';

/** What the model is asked to make of the unread chats (#106), shown before it is sent. */
export const CATCH_UP_INSTRUCTIONS = [
  'Below are the WhatsApp chats with unread messages, as the chat list shows them:',
  'each chat’s name, how many messages are unread, and only the latest one.',
  'Tell the person reading what is waiting for them, in a few short bullet points,',
  'most pressing first, each naming its chat.',
  'You do not see the earlier unread messages, so add nothing that is not here.',
  'Write in the language of the messages.',
].join(' ');

/** One chat as the model reads it: its name, its count and its latest message. */
function entryOf({ name, unread, messages }: UnreadSummaryChat): string {
  // A photo, voice message or sticker has no text in the list's preview.
  const latest = messages.at(-1)?.text ?? '(no text)';
  return [`Chat: ${name}`, `Unread: ${String(unread)}`, `Latest message: ${latest}`].join('\n');
}

/**
 * The unread chats as the model reads them, from the chat list alone, so
 * no chat is opened or marked read. This text, with the instructions, is
 * exactly what the bar shows before anything is sent.
 */
export const digestOf = (chats: readonly UnreadSummaryChat[]): string =>
  chats.map(entryOf).join('\n\n');
