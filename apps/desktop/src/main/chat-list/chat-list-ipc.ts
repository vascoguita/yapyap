import { CHAT_LIST_CHANNELS } from '../../shared/chat-list-api.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';
import type { ViewRegistry } from '../views.ts';
import { isChatListWidth, type ChatListWidths } from './widths.ts';

interface ChatListIpcEvent {
  readonly sender: object;
  readonly senderFrame: { readonly url: string } | null;
}

export interface ChatListIpc {
  on(channel: string, listener: (event: ChatListIpcEvent, ...args: unknown[]) => void): unknown;
}

export interface ChatListIpcDependencies {
  readonly views: ViewRegistry;
  readonly origin: string;
  readonly warn: (message: string) => void;
}

/**
 * Hears the chat list's divider (#79). A width is kept for the account of
 * the WhatsApp view that sent it, on WhatsApp's own origin, so no page can
 * set another account's; it must be whole pixels within bounds. Anything
 * else is dropped and logged without its content.
 */
export function listenToChatList(
  ipc: ChatListIpc,
  widths: Pick<ChatListWidths, 'set'>,
  deps: ChatListIpcDependencies,
): void {
  const accountOf = ({ sender, senderFrame }: ChatListIpcEvent): string | undefined => {
    const view = deps.views.get(sender);
    const fromWhatsApp =
      view?.zone === 'whatsapp' && isSameOrigin(senderFrame?.url ?? '', deps.origin);
    return fromWhatsApp ? view.account : undefined;
  };
  const on = (
    channel: string,
    accepts: (args: readonly unknown[]) => boolean,
    width: (args: readonly unknown[]) => number | undefined,
  ): void => {
    ipc.on(channel, (event, ...args) => {
      const account = accountOf(event);
      if (account === undefined || !accepts(args)) {
        deps.warn('Ignored a chat list message from outside WhatsApp.');
        return;
      }
      widths.set(account, width(args));
    });
  };
  on(
    CHAT_LIST_CHANNELS.resize,
    (args) => args.length === 1 && isChatListWidth(args[0]),
    ([width]) => width as number,
  );
  on(
    CHAT_LIST_CHANNELS.reset,
    (args) => args.length === 0,
    () => undefined,
  );
}
