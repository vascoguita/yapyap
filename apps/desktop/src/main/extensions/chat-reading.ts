import { activeChatReader, parseActiveChat, type ReadChat } from '../../adapter/active-chat.ts';
import { ADAPTER_WORLD_ID } from '../../adapter/page-health.ts';
import {
  parseUnreadSummary,
  unreadSummaryReader,
  type UnreadSummaryChat,
} from '../../adapter/unread-summary.ts';

/** An account's WhatsApp, as far as reading its open chat needs. */
export interface ReadablePage {
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
}

/**
 * The open chat of `page`, with its last `messages` messages, for an extension
 * holding `chat:read-active` (#100); null when no chat is open. What the
 * page returns is checked before an extension sees it, and it is chat content,
 * so it is never logged.
 */
export async function readOpenChat(page: ReadablePage, messages: number): Promise<ReadChat | null> {
  const found = await page.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [
    { code: activeChatReader(messages) },
  ]);
  const chat = parseActiveChat(found, messages);
  if (chat === undefined) {
    throw new Error('The open chat could not be read.');
  }
  return chat;
}

/**
 * The chats with unread messages in `page`'s chat list, for an extension
 * holding `chat:read-unread-summary` (#100). It reads the list alone and
 * never opens a chat, which would mark it read. What the page returns is
 * checked before an extension sees it, and it is chat content, so it is
 * never logged.
 */
export async function readUnreadChats(page: ReadablePage): Promise<readonly UnreadSummaryChat[]> {
  const found = await page.executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [
    { code: unreadSummaryReader() },
  ]);
  const chats = parseUnreadSummary(found);
  if (chats === undefined) {
    throw new Error('The unread chats could not be read.');
  }
  return chats;
}
