import { LANDMARKS } from './page-state.ts';

/** A message's text, or an emoji in it, which a reply may hold in the message it quotes. */
interface IncomingText {
  readonly textContent: string | null;
  readonly dataset: Record<string, string | undefined>;
  closest(selectors: string): unknown;
}

interface IncomingRow {
  readonly dataset: Record<string, string | undefined>;
  querySelector(selectors: string): IncomingText | null;
  querySelectorAll(selectors: string): ArrayLike<IncomingText>;
}

interface IncomingDocument {
  querySelectorAll(selectors: string): ArrayLike<IncomingRow & IncomingText>;
  querySelector(selectors: string): { readonly textContent: string | null } | null;
}

/** Where the badges' probe looks: the chat list's rows, and in a row its unread badge and name. */
interface BadgePlaces {
  readonly chatRow: string;
  readonly unreadCount: string;
  readonly chatTitle: string;
}

/**
 * Where the probe looks: the open chat's messages, the marks on the
 * account's own, its name, its message box and the message the user
 * replies to above it, and in a message, its text, its emoji and the
 * message it quotes.
 */
interface IncomingPlaces {
  readonly message: string;
  readonly outgoing: string;
  readonly chatName: string;
  readonly composer: string;
  readonly composerQuote: string;
  readonly messageBody: string;
  readonly messageText: string;
  readonly emoji: string;
  readonly quoted: string;
}

/**
 * FNV-1a over the UTF-8 bytes, 32 bits, as eight hex digits: short, and
 * enough to tell two names or IDs apart. The probe names the open chat by
 * the fingerprint of its header's `textContent`, and the assistant's bar
 * checks the chat it shows suggestions in by the same one (#741). It runs
 * inside the page as source text, so it stays self-contained.
 */
export function fingerprint(text: string): string {
  let value = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    value = Math.imul(value ^ byte, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

/**
 * The hash of the message the user chose to reply to, quoted above the
 * message box, or `-` while they reply to none (#740): of what the quote
 * shows, its sender's name and text. It goes by no ID, as an element
 * with one in the open chat is a message row by the `message` landmark.
 * A message row may quote a message too, so a quote inside one is never
 * taken for the message box's. Runs inside the page as source text beside
 * {@link newestMessages}, so it stays self-contained.
 */
export function replyingTo(
  doc: IncomingDocument,
  places: IncomingPlaces,
  hash: (text: string) => string,
): string {
  const quote = Array.from(doc.querySelectorAll(places.composerQuote)).find(
    (found) => found.closest(places.message) === null,
  );
  return quote === undefined ? '-' : hash(quote.textContent ?? '');
}

/**
 * Which chat is open, its newest message from someone else, the account's
 * own newest, and whose is last, so the assistant can tell a message
 * arrived or the user sent one (#468). A message is the account's own when
 * its ID says so or it carries a sent message's marks, as the chat reader
 * decides (#410). The page hashes the chat's name and the messages' IDs and
 * hands over only the hashes, never an ID, a name or any text: `-` for a
 * message there is none of, then `i` when the last is someone else's, `o`
 * when it is the account's own, and last `d` while the message box holds a
 * draft, `e` while it is empty, so the assistant can tell the user cleared
 * it (#629), then the hash of what the chat's last message says. An
 * edit keeps a message's ID, so only its text tells that its sender
 * changed it (#739); a reply's text leaves out the message it quotes, as
 * the chat reader's does. Last comes `quoting`'s hash of the message the
 * user chose to reply to, so choosing or removing one counts as a change
 * (#740). Runs inside the page as source text, so it stays
 * self-contained; null while no chat is open.
 */
export function newestMessages(
  doc: IncomingDocument,
  places: IncomingPlaces,
  hash: (text: string) => string,
  quoting: typeof replyingTo,
): string | null {
  const name = doc.querySelector(places.chatName);
  if (name === null) {
    return null;
  }
  const rows = Array.from(doc.querySelectorAll(places.message));
  const own = (row: IncomingRow): boolean =>
    row.dataset['id']?.startsWith('true_') === true || row.querySelector(places.outgoing) !== null;
  const newest = (rowsOf: IncomingRow[]): string => {
    const row = rowsOf.at(-1);
    return row === undefined ? '-' : hash(row.dataset['id'] ?? '');
  };
  const unquoted = (found: IncomingText): boolean => found.closest(places.quoted) === null;
  const said = (row: IncomingRow): string => {
    const body =
      Array.from(row.querySelectorAll(places.messageBody)).find(unquoted) ??
      row.querySelector(places.messageText);
    const emoji = Array.from(row.querySelectorAll(places.emoji))
      .filter(unquoted)
      // The selector finds only images that carry the emoji.
      .map((image) => String(image.dataset['plainText']));
    return hash([body?.textContent ?? '', ...emoji].join('\n'));
  };
  // Whose the last message is, and what it says.
  const about = (row: IncomingRow): readonly [string, string] => [own(row) ? 'o' : 'i', said(row)];
  const last = rows.at(-1);
  const [whose, saying] = last === undefined ? ['-', '-'] : about(last);
  const theirs = newest(rows.filter((row) => !own(row)));
  const draft = (doc.querySelector(places.composer)?.textContent ?? '').trim() === '' ? 'e' : 'd';
  const quote = quoting(doc, places, hash);
  return `${hash(name.textContent ?? '')}:${theirs}:${newest(rows.filter(own))}:${whose}:${draft}:${saying}:${quote}`;
}

/** The most chat list rows whose badges a look hands over. */
const MAX_BADGES = 20;

/**
 * The unread counts the chat list's badges show, at most `limit` of them,
 * each named by the fingerprint of its row's name, the same one
 * {@link newestMessages} gives the open chat's header, so the assistant can
 * tell how many messages were unread in the chat the user opens (#705):
 * WhatsApp marks them read as it opens the chat. It hands over only
 * `hash:count` pairs, joined by commas, or `-` for none, never a name. A
 * badge holds the count alone, in digits whatever the language; a row
 * without one of digits is not unread. Runs inside the page as source
 * text, so it stays self-contained.
 */
export function unreadBadges(
  doc: IncomingDocument,
  places: BadgePlaces,
  hash: (text: string) => string,
  limit: number,
): string {
  const pairs = Array.from(doc.querySelectorAll(places.chatRow)).flatMap((row) => {
    const digits = (row.querySelector(places.unreadCount)?.textContent ?? '').trim();
    const title = row.querySelector(places.chatTitle);
    const unread = /^[1-9]\d{0,5}$/.test(digits) && title !== null;
    return unread ? [`${hash(title.textContent ?? '')}:${digits}`] : [];
  });
  return pairs.length === 0 ? '-' : pairs.slice(0, limit).join(',');
}

/**
 * One look at the page for the assistant: the open chat's hashes, or `-`
 * while none is open, then `|` and the chat list's badges. Runs inside the
 * page as source text, with the probes it joins passed in.
 */
export function lookAtChats(
  doc: IncomingDocument,
  places: IncomingPlaces & BadgePlaces,
  hash: (text: string) => string,
  probes: {
    readonly newest: typeof newestMessages;
    readonly quoting: typeof replyingTo;
    readonly badges: typeof unreadBadges;
    readonly limit: number;
  },
): string {
  const open = probes.newest(doc, places, hash, probes.quoting) ?? '-';
  return `${open}|${probes.badges(doc, places, hash, probes.limit)}`;
}

const LOOK_PLACES: IncomingPlaces & BadgePlaces = {
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
  composer: LANDMARKS.composer,
  composerQuote: LANDMARKS.composerQuote,
  messageBody: LANDMARKS.messageBody,
  messageText: LANDMARKS.messageText,
  emoji: LANDMARKS.emoji,
  quoted: LANDMARKS.quoted,
  chatRow: LANDMARKS.chatRow,
  unreadCount: LANDMARKS.unreadCount,
  chatTitle: LANDMARKS.chatTitle,
};

/** The look as code for `executeJavaScriptInIsolatedWorld`, with the fingerprint and the probes it joins beside it. */
export const NEWEST_MESSAGES = `(${lookAtChats.toString()})(document, ${JSON.stringify(LOOK_PLACES)}, ${fingerprint.toString()}, { newest: ${newestMessages.toString()}, quoting: ${replyingTo.toString()}, badges: ${unreadBadges.toString()}, limit: ${String(MAX_BADGES)} })`;

/** What the probe saw, as hashes: the open chat, and its newest messages from each side. */
export interface Newest {
  readonly chat: string;
  /** Someone else's newest message, or null for none. */
  readonly theirs: string | null;
  /** The account's own newest message, or null for none. */
  readonly mine: string | null;
  /** Whether the chat's last message is someone else's. */
  readonly theirsLast: boolean;
  /** Whether the message box holds a draft. */
  readonly drafting: boolean;
  /** What the chat's last message says, or null for a chat with none; another after an edit (#739). */
  readonly said: string | null;
  /** The message the user chose to reply to, above the message box, or null for none (#740). */
  readonly quote: string | null;
}

const HASH = '([0-9a-f]{8}|-)';
const ANSWER = new RegExp(`^([0-9a-f]{8}):${HASH}:${HASH}:([io-]):([de]):${HASH}:${HASH}$`);

const hashOrNull = (value: string | undefined): string | null =>
  value === undefined || value === '-' ? null : value;

/** The probe's answer: null while no chat is open, undefined for anything else. */
export function parseNewest(value: unknown): Newest | null | undefined {
  if (value === null) {
    return null;
  }
  const match = typeof value === 'string' ? ANSWER.exec(value) : null;
  if (match === null) {
    return undefined;
  }
  return {
    chat: String(match[1]),
    theirs: hashOrNull(match[2]),
    mine: hashOrNull(match[3]),
    theirsLast: match[4] === 'i',
    drafting: match[5] === 'd',
    said: hashOrNull(match[6]),
    quote: hashOrNull(match[7]),
  };
}

/** What a look saw: the open chat, or null for none, and the unread counts of the chat list's badges. */
export interface Look {
  readonly newest: Newest | null;
  /** Each badge's count, by the fingerprint of its chat's name. */
  readonly unread: ReadonlyMap<string, number>;
}

const PAIR = String.raw`[0-9a-f]{8}:[1-9]\d{0,5}`;
const BADGES = new RegExp(`^(?:-|${PAIR}(?:,${PAIR}){0,${String(MAX_BADGES - 1)}})$`);

/** The badges' counts by chat, or undefined for anything the badges' probe never answers. */
function parseBadges(value: string): ReadonlyMap<string, number> | undefined {
  if (!BADGES.test(value)) {
    return undefined;
  }
  const pairs = value === '-' ? [] : value.split(',');
  return new Map(
    pairs.map((pair): [string, number] => {
      const [chat = '', count = ''] = pair.split(':');
      return [chat, Number(count)];
    }),
  );
}

/** The look's answer; undefined for anything else. */
export function parseLook(value: unknown): Look | undefined {
  const [open = '', badges = '', ...rest] = typeof value === 'string' ? value.split('|') : [];
  const newest = parseNewest(open === '-' ? null : open);
  const unread = rest.length === 0 ? parseBadges(badges) : undefined;
  return newest === undefined || unread === undefined ? undefined : { newest, unread };
}
