/**
 * Bump whenever a landmark below changes, so diagnostics show which table a
 * report came from.
 */
export const LANDMARKS_VERSION = 9;

/**
 * Structural landmarks of WhatsApp Web: element ids and attributes that have
 * outlived many redesigns, never its generated class names. A WhatsApp change
 * that breaks the adapter is fixed here, and in the fake page that mirrors it.
 */
export const LANDMARKS = {
  /** The root WhatsApp renders into. */
  app: '#app',
  /** The QR code shown while the account is logged out. */
  loginCode: '[data-ref]',
  /** The chat list, present once the account is logged in. */
  chatList: '#pane-side',
  /**
   * The chat list's own box. Its parent is the column WhatsApp sizes as a
   * flex item, which YapYap resizes to the account's width (#79).
   */
  chatColumn: '#side',
  /** The open conversation. */
  conversation: '#main',
  /** The open conversation's message box, where a reply from a notification goes (#60). */
  composer: '#main footer [contenteditable="true"]',
  /** The row around the open conversation's message box, which the assistant bar sits above (#466). */
  composerFooter: '#main footer',
  /** The open chat's name in its header (#100); older pages named it only by direction (#410). */
  chatName:
    '#main header [data-testid="conversation-info-header-chat-title"], #main header span[dir="auto"]',
  /**
   * A message in the open chat. Its ID starts with `true_` when the account
   * sent it, and names a `@g.us` chat in groups (#100).
   */
  message: '#main [data-id]',
  /** The text of a message, which WhatsApp marks for copying with its sender and time. */
  messageText: '[data-pre-plain-text]',
  /** Just the body of a message's text, without the time WhatsApp lays out beside it (#410). */
  messageBody: '[data-pre-plain-text] [data-testid="selectable-text"]',
  /**
   * Marks on the account's own messages: the tail of the first in a run, and
   * the delivery status, which only sent messages have (#410).
   */
  outgoing: '[data-testid="tail-out"], [data-testid="msg-meta"][role="button"]',
  /**
   * The sender's name above a message, which only group chats show for
   * other people's messages; a quoted message carries one in any chat (#410).
   */
  author: '[data-testid="author"]',
  quoted: '[data-testid="quoted-message"]',
  /** The account's own profile photo, on the profile button at the foot of the navigation bar (#87). */
  ownAvatar: '[data-testid="navbar-footer-section"] button[data-navbar-item] img',
  /**
   * A chat in the chat list (#100). The list is virtualized, so only rows near
   * the screen exist, and their order in the page may differ from the order shown.
   */
  chatRow: '#pane-side [data-testid^="list-item-"]',
  /** A chat row's unread badge, whose text is only the count, in digits whatever the language. */
  unreadCount: '[data-testid="icon-unread-count"]',
  /** A chat row's name. */
  chatTitle: '[data-testid="cell-frame-title"]',
  /** A chat row's preview of its last message. */
  chatPreview: '[data-testid="cell-frame-secondary"]',
  /** A chat row's time of its last message. */
  chatTimestamp: '[data-testid="chat-list-timestamp"]',
} as const;

type Landmarks = Readonly<Record<keyof typeof LANDMARKS, string>>;

type PageView = 'unknown' | 'loading' | 'logged-out' | 'chats';

const PAGE_VIEWS: ReadonlySet<unknown> = new Set<PageView>([
  'unknown',
  'loading',
  'logged-out',
  'chats',
]);

/** The most unread chats WhatsApp's title can show without overflowing. */
const MAX_UNREAD = 999_999;

export interface PageState {
  readonly view: PageView;
  readonly chatOpen: boolean;
  /** Chats with unread messages, as the page title counts them. */
  readonly unread: number;
}

interface ProbedDocument {
  readonly title: string;
  querySelector(selectors: string): unknown;
}

/**
 * Runs inside the page, so it must stay self-contained: it is sent as source
 * text, with the landmarks as an argument. It never reads page text beyond
 * the title's leading count, and never adds observers, so typing and
 * scrolling never wait for it. A missing landmark makes it report less, never
 * fail.
 */
export function probePageState(doc: ProbedDocument, landmarks: Landmarks): PageState {
  const has = (selector: string): boolean => doc.querySelector(selector) !== null;
  // WhatsApp prefixes its title with the unread count, as in "(3) WhatsApp".
  const count = /^\((\d{1,6})\)/.exec(doc.title);
  const unread = count === null ? 0 : Number(count[1]);
  if (!has(landmarks.app)) {
    return { view: 'unknown', chatOpen: false, unread };
  }
  if (has(landmarks.loginCode)) {
    return { view: 'logged-out', chatOpen: false, unread: 0 };
  }
  if (!has(landmarks.chatList)) {
    return { view: 'loading', chatOpen: false, unread };
  }
  return { view: 'chats', chatOpen: has(landmarks.conversation), unread };
}

/**
 * The unread count in a page title, read in the main process from title
 * changes. The probe repeats the pattern because it runs as source text in
 * the page; a test keeps the two in step.
 */
export function unreadInTitle(title: string): number {
  const count = /^\((\d{1,6})\)/.exec(title);
  return count === null ? 0 : Number(count[1]);
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const PAGE_STATE_PROBE = `(${probePageState.toString()})(document, ${JSON.stringify(LANDMARKS)})`;

function isUnreadCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_UNREAD;
}

/** Accepts only the exact shape the probe returns. */
export function parsePageState(value: unknown): PageState | undefined {
  const { view, chatOpen, unread } = Object(value) as Record<string, unknown>;
  const valid = PAGE_VIEWS.has(view) && typeof chatOpen === 'boolean' && isUnreadCount(unread);
  return valid ? { chatOpen, unread, view: view as PageView } : undefined;
}

/** One line for diagnostics. It leaves out the unread count, which is account activity. */
export function describePageState(state: PageState | undefined): string {
  return state === undefined
    ? `WhatsApp page unavailable (landmarks v${String(LANDMARKS_VERSION)})`
    : `WhatsApp view=${state.view}, chat_open=${String(state.chatOpen)} (landmarks v${String(LANDMARKS_VERSION)})`;
}
