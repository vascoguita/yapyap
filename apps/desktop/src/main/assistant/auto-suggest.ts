import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { NEWEST_MESSAGES, parseNewest, type Newest } from '../../adapter/incoming.ts';

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
  /** The first look found the open chat, with its newest message from someone else if that is its last. */
  readonly found: (message: string | null) => unknown;
  /** Another chat is open, with its newest message from someone else if that is its last. */
  readonly opened: (message: string | null) => unknown;
  /** A message from someone else arrived in the open chat. */
  readonly arrived: (message: string) => unknown;
  /** The user sent a message in the open chat. */
  readonly sent: () => unknown;
  /** The open chat's message box is empty, and the user sent nothing since the last look. */
  readonly cleared: () => unknown;
  readonly every: (callback: () => void, ms: number) => unknown;
}

/** What was last seen: on which page, and there, the open chat's newest messages, or no chat. */
interface Seen {
  readonly page: AdapterPage;
  readonly newest: Newest | null;
}

/** Someone else's newest message, named by its chat and itself, while it is the chat's last. */
const answerable = (newest: Newest | null): string | null =>
  newest?.theirsLast === true && newest.theirs !== null ? `${newest.chat}:${newest.theirs}` : null;

/** Someone else's newest message, while it is the chat's last, if it is new since `was`. */
const newMessage = (was: Newest, now: Newest): string | null =>
  now.theirs === was.theirs ? null : answerable(now);

/**
 * Tells what changed in the chat that stayed open: the user sent a
 * message, or a message arrived; and, at every look, that the message box
 * is empty, as a draft a rewrite filled may be cleared between two looks.
 */
function inSameChat(was: Newest, now: Newest, deps: ChatWatchDependencies): void {
  if (now.mine !== null && now.mine !== was.mine) {
    deps.sent();
  } else if (!now.drafting) {
    deps.cleared();
  }
  const message = newMessage(was, now);
  if (message !== null) {
    deps.arrived(message);
  }
}

/** Whether the same chat is open as at the last look, or still none; never at the first look. */
const sameChat = (was: Newest | null | undefined, now: Newest | null): boolean =>
  was !== undefined && was?.chat === now?.chat;

/**
 * Tells what changed between two looks at the same page. The first look
 * only finds the chat: the user may already have rewritten a draft there,
 * and its notice and Undo stay.
 */
function compare(before: Seen | undefined, now: Seen, deps: ChatWatchDependencies): void {
  const was = before?.page === now.page ? before.newest : undefined;
  const { newest } = now;
  if (before === undefined) {
    deps.found(answerable(newest));
  } else if (!sameChat(was, newest)) {
    deps.opened(answerable(newest));
  } else if (was && newest) {
    inSameChat(was, newest, deps);
  }
}

/**
 * Follows the open chat while the assistant shows (#468): about every
 * second and a half, it asks the page for hashes of the open chat and its
 * newest messages, and tells when another chat opens, a message arrives,
 * or the user sends one. The adapter adds no observers, so a cheap look
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
    const newest = parseNewest(await runInAdapterWorld(page, NEWEST_MESSAGES));
    // An answer that came after the look was given up on is stale.
    if (newest === undefined || number !== current) {
      return;
    }
    const now = { page, newest };
    const before = seen;
    seen = now;
    compare(before, now, deps);
  };
  const busy = (): boolean => {
    waited += 1;
    return current !== 0 && waited <= GIVE_UP_AFTER;
  };
  deps.every(() => {
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
  }, LOOK_EVERY_MS);
}
