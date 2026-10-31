import type { ChatApi, UnreadChat } from '@yapyap/extension-sdk';

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
function entryOf({ name, unread, messages }: UnreadChat): string {
  // A photo, voice message or sticker has no text in the list's preview.
  const latest = messages.at(-1)?.text ?? '(no text)';
  return [`Chat: ${name}`, `Unread: ${String(unread)}`, `Latest message: ${latest}`].join('\n');
}

/**
 * The unread chats as the model reads them. This text, with the
 * instructions, is exactly what the panel shows before anything is sent.
 */
const digestOf = (chats: readonly UnreadChat[]): string => chats.map(entryOf).join('\n\n');

/**
 * The unread chats' text, or why there is none: none unread, or YapYap
 * not letting the assistant see them in this account. The host reads the
 * chat list alone, so no chat is opened or marked read.
 */
export async function unreadDigest(
  chat: Pick<ChatApi, 'readUnreadSummary'>,
): Promise<{ readonly text: string } | { readonly reason: 'no-unread' | 'unread-not-granted' }> {
  let chats: readonly UnreadChat[];
  try {
    chats = await chat.readUnreadSummary();
  } catch (error) {
    // The panel's general words for a refused grant would point at the open chat.
    if ((Object(error) as { kind?: unknown }).kind === 'not-granted') {
      return { reason: 'unread-not-granted' };
    }
    throw error;
  }
  return chats.length === 0 ? { reason: 'no-unread' } : { text: digestOf(chats) };
}
