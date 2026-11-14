import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { NEWEST_MESSAGES, parseNewest, type Newest } from '../../adapter/incoming.ts';

/** How often the open chat is looked at while the assistant shows. */
export const LOOK_EVERY_MS = 1500;

export interface ChatWatchDependencies {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => AdapterPage;
  /** Whether the assistant is on; it looks at no chat while it is off. */
  readonly enabled: () => boolean;
  /** Whether YapYap's window is on screen, where the user can change the chat. */
  readonly onScreen: () => boolean;
  /** Another chat is open, with its newest message from someone else if that is its last. */
  readonly opened: (message: string | null) => unknown;
  /** A message from someone else arrived in the open chat. */
  readonly arrived: (message: string) => unknown;
  /** The user sent a message in the open chat. */
  readonly sent: () => unknown;
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

/** Tells what changed in the chat that stayed open: the user sent a message, or one arrived. */
function inSameChat(was: Newest, now: Newest, deps: ChatWatchDependencies): void {
  if (now.mine !== null && now.mine !== was.mine) {
    deps.sent();
  }
  const message = newMessage(was, now);
  if (message !== null) {
    deps.arrived(message);
  }
}

/** Whether the same chat is open as at the last look, or still none; never at the first look. */
const sameChat = (was: Newest | null | undefined, now: Newest | null): boolean =>
  was !== undefined && was?.chat === now?.chat;

/** Tells what changed between two looks at the same page. */
function compare(before: Seen | undefined, now: Seen, deps: ChatWatchDependencies): void {
  const was = before?.page === now.page ? before.newest : undefined;
  const { newest } = now;
  if (!sameChat(was, newest)) {
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
 * comes before the window is on screen: a window that first gets focus
 * when the user is already in a chat would otherwise make that chat look
 * newly opened, and forget a rewrite's Undo the user just got.
 */
export function followOpenChat(deps: ChatWatchDependencies): void {
  let seen: Seen | undefined;
  let looking = false;
  const look = async (): Promise<void> => {
    const page = deps.activePage();
    const newest = parseNewest(await runInAdapterWorld(page, NEWEST_MESSAGES));
    if (newest === undefined) {
      return;
    }
    console.error(`[dbg] ${new Date().toISOString().slice(17,23)} look first=${String(seen === undefined)} chat=${String(newest?.chat ?? null)} mine=${String(newest?.mine ?? null)}`);
    const now = { page, newest };
    const before = seen;
    seen = now;
    compare(before, now, deps);
  };
  deps.every(() => {
    if (looking || !deps.enabled() || (seen !== undefined && !deps.onScreen())) {
      return;
    }
    looking = true;
    // A page between loads cannot answer; the next look tries again.
    look()
      .catch(() => undefined)
      .finally(() => {
        looking = false;
      });
  }, LOOK_EVERY_MS);
}
