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
  querySelectorAll(selectors: string): ArrayLike<IncomingRow>;
  querySelector(selectors: string): { readonly textContent: string | null } | null;
}

/**
 * Where the probe looks: the open chat's messages, the marks on the
 * account's own, its name, its message box, and in a message, its text,
 * its emoji and the message it quotes.
 */
interface IncomingPlaces {
  readonly message: string;
  readonly outgoing: string;
  readonly chatName: string;
  readonly composer: string;
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
 * Which chat is open, its newest message from someone else, the account's
 * own newest, and whose is last, so the assistant can tell a message
 * arrived or the user sent one (#468). A message is the account's own when
 * its ID says so or it carries a sent message's marks, as the chat reader
 * decides (#410). The page hashes the chat's name and the messages' IDs and
 * hands over only the hashes, never an ID, a name or any text: `-` for a
 * message there is none of, then `i` when the last is someone else's, `o`
 * when it is the account's own, and last `d` while the message box holds a
 * draft, `e` while it is empty, so the assistant can tell the user cleared
 * it (#629), and last the hash of what the chat's last message says. An
 * edit keeps a message's ID, so only its text tells that its sender
 * changed it (#739); a reply's text leaves out the message it quotes, as
 * the chat reader's does. Runs inside the page as source text, so it
 * stays self-contained; null while no chat is open.
 */
export function newestMessages(
  doc: IncomingDocument,
  places: IncomingPlaces,
  hash: (text: string) => string,
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
  return `${hash(name.textContent ?? '')}:${theirs}:${newest(rows.filter(own))}:${whose}:${draft}:${saying}`;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`, with the fingerprint beside it. */
export const NEWEST_MESSAGES = `(${newestMessages.toString()})(document, ${JSON.stringify({
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
  composer: LANDMARKS.composer,
  messageBody: LANDMARKS.messageBody,
  messageText: LANDMARKS.messageText,
  emoji: LANDMARKS.emoji,
  quoted: LANDMARKS.quoted,
})}, ${fingerprint.toString()})`;

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
}

const HASH = '([0-9a-f]{8}|-)';
const ANSWER = new RegExp(`^([0-9a-f]{8}):${HASH}:${HASH}:([io-]):([de]):${HASH}$`);

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
  };
}
