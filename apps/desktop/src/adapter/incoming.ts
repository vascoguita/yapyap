import { LANDMARKS } from './page-state.ts';

interface IncomingRow {
  readonly dataset: Record<string, string | undefined>;
  querySelector(selectors: string): unknown;
}

interface IncomingDocument {
  querySelectorAll(selectors: string): ArrayLike<IncomingRow>;
  querySelector(selectors: string): { readonly textContent: string | null } | null;
}

/** Where the probe looks: the open chat's messages, the marks on the account's own, its name. */
interface IncomingPlaces {
  readonly message: string;
  readonly outgoing: string;
  readonly chatName: string;
}

/**
 * Which chat is open, its newest message from someone else, the account's
 * own newest, and whose is last, so the assistant can tell a message
 * arrived or the user sent one (#468). A message is the account's own when
 * its ID says so or it carries a sent message's marks, as the chat reader
 * decides (#410). The page hashes the chat's name and the messages' IDs and
 * hands over only the hashes, never an ID, a name or any text: `-` for a
 * message there is none of, then `i` when the last is someone else's, `o`
 * when it is the account's own. Runs inside the page as source text, so it
 * stays self-contained; null while no chat is open.
 */
export function newestMessages(doc: IncomingDocument, places: IncomingPlaces): string | null {
  const name = doc.querySelector(places.chatName);
  if (name === null) {
    return null;
  }
  // FNV-1a over the UTF-8 bytes, 32 bits: short, and enough to tell two names or IDs apart.
  const offsetBasis = 0x811c9dc5;
  const prime = 0x01000193;
  const hash = (text: string): string => {
    let value = offsetBasis;
    for (const byte of new TextEncoder().encode(text)) {
      value = Math.imul(value ^ byte, prime) >>> 0;
    }
    return value.toString(16).padStart(8, '0');
  };
  const rows = Array.from(doc.querySelectorAll(places.message));
  const own = (row: IncomingRow): boolean =>
    row.dataset['id']?.startsWith('true_') === true || row.querySelector(places.outgoing) !== null;
  const newest = (rowsOf: IncomingRow[]): string => {
    const row = rowsOf.at(-1);
    return row === undefined ? '-' : hash(row.dataset['id'] ?? '');
  };
  const last = rows.at(-1);
  let whose = '-';
  if (last !== undefined) {
    whose = own(last) ? 'o' : 'i';
  }
  const theirs = newest(rows.filter((row) => !own(row)));
  return `${hash(name.textContent ?? '')}:${theirs}:${newest(rows.filter(own))}:${whose}`;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const NEWEST_MESSAGES = `(${newestMessages.toString()})(document, ${JSON.stringify({
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
})})`;

/** What the probe saw, as hashes: the open chat, and its newest messages from each side. */
export interface Newest {
  readonly chat: string;
  /** Someone else's newest message, or null for none. */
  readonly theirs: string | null;
  /** The account's own newest message, or null for none. */
  readonly mine: string | null;
  /** Whether the chat's last message is someone else's. */
  readonly theirsLast: boolean;
}

const HASH = '([0-9a-f]{8}|-)';
const ANSWER = new RegExp(`^([0-9a-f]{8}):${HASH}:${HASH}:([io-])$`);

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
  };
}
