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
 * Which chat is open and which is the newest message someone else sent in
 * it, so the assistant can tell a new one arrived (#468). A message is the
 * account's own when its ID says so or it carries a sent message's marks,
 * as the chat reader decides (#410). The page hashes the chat's name and
 * the message's ID and hands over only the hashes, never an ID, a name or
 * any text. Runs inside the page as source text, so it stays self-contained;
 * null when the open chat shows no message from anyone else.
 */
export function newestIncoming(doc: IncomingDocument, places: IncomingPlaces): string | null {
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
  const theirs = Array.from(doc.querySelectorAll(places.message)).filter((row) => {
    const own = row.dataset['id']?.startsWith('true_') === true;
    return !own && row.querySelector(places.outgoing) === null;
  });
  const newest = theirs.at(-1);
  if (newest === undefined) {
    return null;
  }
  const chat = doc.querySelector(places.chatName)?.textContent ?? '';
  return `${hash(chat)}:${hash(newest.dataset['id'] ?? '')}`;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const NEWEST_INCOMING = `(${newestIncoming.toString()})(document, ${JSON.stringify({
  message: LANDMARKS.message,
  outgoing: LANDMARKS.outgoing,
  chatName: LANDMARKS.chatName,
})})`;

/** What the probe saw: hashes of the open chat and of its newest message from someone else. */
export interface Incoming {
  readonly chat: string | null;
  readonly message: string | null;
}

/** The probe's answer, with both null when no one else wrote; undefined for anything else. */
export function parseIncoming(value: unknown): Incoming | undefined {
  if (value === null) {
    return { chat: null, message: null };
  }
  const match = typeof value === 'string' ? /^([0-9a-f]{8}):([0-9a-f]{8})$/.exec(value) : null;
  return match === null ? undefined : { chat: String(match[1]), message: String(match[2]) };
}
