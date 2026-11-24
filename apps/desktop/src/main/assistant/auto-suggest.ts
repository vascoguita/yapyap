import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { NEWEST_MESSAGES, parseLook, type Look, type Newest } from '../../adapter/incoming.ts';

/** How often the open chat is looked at while the assistant shows. */
export const LOOK_EVERY_MS = 1500;

/**
 * How many turns a look may wait for the page before the next one starts
 * anyway, about six seconds. A page can leave a call unanswered, as when it
 * reloads mid-call, and the follow must not wait for it forever (#721).
 */
export const GIVE_UP_AFTER = 4;

export interface ChatWatchDependencies {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => AdapterPage;
  /** Whether the assistant is on; it looks at no chat while it is off. */
  readonly enabled: () => boolean;
  /** Whether YapYap's window is on screen, where the user can change the chat. */
  readonly onScreen: () => boolean;
  /**
   * The first look found the open chat, with its last item, or found none
   * open; `unread` is how many messages it opened with unread.
   */
  readonly found: (message: string | null, unread: number) => unknown;
  /** Another chat is open, with its last item and, as for `found`, its unread messages; or none is. */
  readonly opened: (message: string | null, unread: number) => unknown;
  /**
   * Another item is the open chat's last: someone else's that arrived, or
   * the user's own (#723); or the user chose another message to reply to,
   * or removed it (#740).
   */
  readonly arrived: (message: string) => unknown;
  /** The user sent a message in the open chat. */
  readonly sent: () => unknown;
  /** The open chat's message box is empty, and the user sent nothing since the last look. */
  readonly cleared: () => unknown;
  readonly every: (callback: () => void, ms: number) => unknown;
  /**
   * Calls `callback` as YapYap's window gets the focus. A click on a chat
   * in a window that had none focuses it and opens the chat at once, and
   * WhatsApp takes the chat's unread badge away as it opens, so a look
   * right then still sees the badge (#705).
   */
  readonly focused: (callback: () => void) => unknown;
}

/**
 * What was last seen: on which page, and there, the open chat's newest
 * messages, or no chat, and the chat list's unread badges.
 */
interface Seen extends Look {
  readonly page: AdapterPage;
}

/** The chat's last item, whoever's it is, or null for a chat with none. */
const lastOf = (newest: Newest): string | null => (newest.theirsLast ? newest.theirs : newest.mine);

/**
 * What the assistant suggests replies to, named by the open chat, its last
 * item and what that says, and the message the user chose to reply to:
 * that message, if there is one (#740), else the last item, whoever sent
 * it (#723). `-` stands for the item of a chat with none yet, and for no
 * message replied to. An edited item says something else, so it is
 * another, and suggestions are made for it again (#739); choosing a
 * message to reply to, or removing it, names another too. Null while no
 * chat is open.
 */
const answerable = (newest: Newest | null): string | null =>
  newest === null
    ? null
    : `${newest.chat}:${lastOf(newest) ?? '-'}:${newest.said ?? '-'}:${newest.quote ?? '-'}`;

/**
 * What to suggest replies to, if it is another than at the look before:
 * another last item, the same edited, or another message replied to.
 */
const newMessage = (was: Newest, now: Newest): string | null => {
  const message = answerable(now);
  return message === answerable(was) ? null : message;
};

/**
 * Tells what changed in the chat that stayed open: the user sent a
 * message, then that the chat has another last item, theirs or the user's,
 * that its last was edited, or that the user chose another message to
 * reply to or removed it;
 * and, at every look, that the message box is empty, as a draft a rewrite
 * filled may be cleared between two looks.
 */
function inSameChat(was: Newest, now: Newest, deps: ChatWatchDependencies): void {
  if (sentNow(was, now)) {
    deps.sent();
  } else if (!now.drafting) {
    deps.cleared();
  }
  const message = newMessage(was, now);
  if (message !== null) {
    deps.arrived(message);
  }
}

/**
 * Whether the user sent a message since the last look: their newest is
 * another one, and it is the chat's last. WhatsApp draws a chat it opens a
 * little at a time, so the user's older messages appear after its last one
 * did; taking that for a send called off the suggestions being made for
 * it, and none came (#743).
 */
const sentNow = (was: Newest, now: Newest): boolean =>
  !now.theirsLast && now.mine !== null && now.mine !== was.mine;

/** Whether the same chat is open as at the last look, or still none; never at the first look. */
const sameChat = (was: Newest | null | undefined, now: Newest | null): boolean =>
  was !== undefined && was?.chat === now?.chat;

/**
 * How many messages were unread in the chat open now (#705). WhatsApp marks them read as the
 * chat opens and takes its badge away, so the count is the badge's at the
 * look before, on the same page; a badge still drawn at this look counts
 * too, as at the first look, which has none before it. Badges are named by
 * the same fingerprint as the open chat's header, so a chat whose list name
 * reads differently, or whose row was scrolled out of the list, is offered
 * nothing.
 */
function unreadOnOpening(before: Seen | undefined, now: Seen): number {
  const chat = now.newest?.chat;
  if (chat === undefined) {
    return 0;
  }
  const was = before?.page === now.page ? (before.unread.get(chat) ?? 0) : 0;
  return Math.max(was, now.unread.get(chat) ?? 0);
}

/**
 * Tells what changed between two looks at the same page. The first look
 * only finds the chat: the user may already have rewritten a draft there,
 * and its notice and Undo stay.
 */
function compare(before: Seen | undefined, now: Seen, deps: ChatWatchDependencies): void {
  const was = before?.page === now.page ? before.newest : undefined;
  const { newest } = now;
  if (before === undefined) {
    deps.found(answerable(newest), unreadOnOpening(before, now));
  } else if (!sameChat(was, newest)) {
    deps.opened(answerable(newest), unreadOnOpening(before, now));
  } else if (was && newest) {
    inSameChat(was, newest, deps);
  }
}

/**
 * Follows the open chat while the assistant shows (#468): about every
 * second and a half, it asks the page for hashes of the open chat and its
 * newest messages, with the chat list's unread counts, and tells when
 * another chat opens, with how many messages it had unread (#705), a
 * message arrives, or the user sends one. The adapter adds no observers, so a cheap look
 * stands in for one, and it never sees page text. Only the first look
 * comes before the window is on screen, so what the user does once it
 * gets focus is told against the chat they were in.
 */
export function followOpenChat(deps: ChatWatchDependencies): void {
  let seen: Seen | undefined;
  // Looks are numbered as they start; `current` is the one under way, 0 while none is.
  let started = 0;
  let current = 0;
  let waited = 0;
  const look = async (number: number): Promise<void> => {
    const page = deps.activePage();
    const seenNow = parseLook(await runInAdapterWorld(page, NEWEST_MESSAGES));
    // An answer that came after the look was given up on is stale.
    if (seenNow === undefined || number !== current) {
      return;
    }
    const now = { page, ...seenNow };
    const before = seen;
    seen = now;
    compare(before, now, deps);
  };
  const busy = (): boolean => {
    waited += 1;
    return current !== 0 && waited <= GIVE_UP_AFTER;
  };
  const tick = (): void => {
    if (busy() || !deps.enabled() || (seen !== undefined && !deps.onScreen())) {
      return;
    }
    started += 1;
    const number = started;
    current = number;
    waited = 0;
    // A page between loads cannot answer; the next look tries again.
    look(number)
      .catch(() => undefined)
      .finally(() => {
        if (current === number) {
          current = 0;
        }
      });
  };
  deps.every(tick, LOOK_EVERY_MS);
  deps.focused(tick);
}
