import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { parseInternationalNumber } from '../shared/phone-number.ts';
import { LANDMARKS } from './page-state.ts';

/** Longest message text the assistant receives; a longer message is cut. */
const MAX_TEXT = 4096;
/** Longest chat or sender name the assistant receives. */
const MAX_NAME = 256;
/** Longest quoted text the assistant receives with a reply. */
const MAX_QUOTE = 512;
/** Longest copy mark (`[time, date] Sender: `) the reader passes on. */
const MAX_META = 320;

interface ReadElement {
  readonly textContent: string | null;
  readonly innerText?: string;
  readonly dataset?: { readonly id?: string; readonly prePlainText?: string };
  querySelector(selectors: string): unknown;
  querySelectorAll?(selectors: string): Iterable<unknown> & ArrayLike<unknown>;
  closest(selectors: string): unknown;
}

interface ReadDocument {
  querySelector(selectors: string): unknown;
  querySelectorAll(selectors: string): Iterable<unknown> & ArrayLike<unknown>;
}

interface ChatPlaces {
  readonly conversation: string;
  readonly chatName: string;
  readonly message: string;
  readonly messageText: string;
  readonly messageBody: string;
  readonly outgoing: string;
  readonly author: string;
  readonly quoted: string;
}

interface Limits {
  readonly messages: number;
  readonly text: number;
  readonly name: number;
  readonly quote: number;
  readonly meta: number;
}

/**
 * Reads the open chat as plain data: its name, whether it is a group, and
 * the text of its last `limits.messages` messages, oldest first, each with
 * WhatsApp's copy mark (its time and sender) and the message it quotes.
 * Unlike the probes, it returns page text, so it runs only when the
 * assistant asks, and its result is never logged.
 * It runs inside the page as source text, so it must stay self-contained.
 * Messages without text, such as photos, are left out.
 */
export function readActiveChat(doc: ReadDocument, places: ChatPlaces, limits: Limits): unknown {
  if (doc.querySelector(places.conversation) === null) {
    return null;
  }
  const textOf = (element: unknown): string => {
    const found = element as ReadElement | null;
    return (found?.innerText ?? found?.textContent ?? '').trim();
  };
  const idOf = (row: ReadElement): string => row.dataset?.id ?? '';
  const all = (from: ReadElement | ReadDocument, selector: string): ReadElement[] =>
    Array.from(from.querySelectorAll?.(selector) ?? []) as ReadElement[];
  const unquoted = (found: ReadElement): boolean => found.closest(places.quoted) === null;
  // WhatsApp once marked the account's own messages by their ID, and now
  // only by the tail and delivery status they alone have (#410).
  const outgoing = (row: ReadElement): boolean =>
    idOf(row).startsWith('true_') || row.querySelector(places.outgoing) !== null;
  // A reply holds the message it quotes, whose text is not the reply's own.
  const own = (row: ReadElement, selector: string): ReadElement | null =>
    all(row, selector).find(unquoted) ?? (row.querySelector(selector) as ReadElement | null);
  const quoteOf = (row: ReadElement) => {
    const quoted = row.querySelector(places.quoted) as ReadElement | null;
    const [author, said] = [textOf(quoted?.querySelector(places.author)), textOf(quoted)];
    const text = said.replace(author, '').trim();
    const quote = { author: author.slice(0, limits.name), text: text.slice(0, limits.quote) };
    return text === '' ? {} : { quote };
  };
  const messageOf = (row: ReadElement) => {
    const body = own(row, places.messageBody) ?? row.querySelector(places.messageText);
    const text = textOf(body).slice(0, limits.text);
    const meta = (own(row, places.messageText)?.dataset?.prePlainText ?? '').slice(0, limits.meta);
    const marked = meta === '' ? {} : { meta };
    return text === '' ? [] : [{ outgoing: outgoing(row), text, ...marked, ...quoteOf(row) }];
  };
  const rows = all(doc, places.message);
  return {
    name: textOf(doc.querySelector(places.chatName)).slice(0, limits.name),
    // IDs named a group's chat until WhatsApp made them bare; now only groups
    // show a sender's name outside a quoted message (#410).
    group:
      rows.some((row) => idOf(row).includes('@g.us')) ||
      all(doc, `${places.message} ${places.author}`).some(unquoted),
    messages: rows.flatMap(messageOf).slice(-limits.messages),
  };
}

const PLACES: ChatPlaces = {
  conversation: LANDMARKS.conversation,
  chatName: LANDMARKS.chatName,
  message: LANDMARKS.message,
  messageText: LANDMARKS.messageText,
  messageBody: LANDMARKS.messageBody,
  outgoing: LANDMARKS.outgoing,
  author: LANDMARKS.author,
  quoted: LANDMARKS.quoted,
};

/** The reader as code for `executeJavaScriptInIsolatedWorld`, for the last `messages` messages. */
export function activeChatReader(messages: number): string {
  const limits: Limits = {
    messages,
    text: MAX_TEXT,
    name: MAX_NAME,
    quote: MAX_QUOTE,
    meta: MAX_META,
  };
  return `(${readActiveChat.toString()})(document, ${JSON.stringify(PLACES)}, ${JSON.stringify(limits)})`;
}

const ActiveChatSchema = Type.Object(
  {
    name: Type.String({ maxLength: MAX_NAME }),
    group: Type.Boolean(),
    messages: Type.Array(
      Type.Object(
        {
          outgoing: Type.Boolean(),
          text: Type.String({ minLength: 1, maxLength: MAX_TEXT }),
          meta: Type.Optional(Type.String({ maxLength: MAX_META })),
          quote: Type.Optional(
            Type.Object(
              {
                author: Type.String({ maxLength: MAX_NAME }),
                text: Type.String({ minLength: 1, maxLength: MAX_QUOTE }),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

/** The message a reply quotes. */
interface Quote {
  /** Its sender as the quote names them, or '' when it names none. */
  readonly author: string;
  readonly text: string;
}

/** One message of the open chat. */
export interface ReadMessage {
  readonly outgoing: boolean;
  readonly text: string;
  /** When it was sent, as WhatsApp writes it in the user's own format, such as `20:01, 24/10/2026`. */
  readonly time?: string;
  /** Who sent it, as WhatsApp names them; a number is never passed on (see {@link maskNumbers}). */
  readonly author?: string;
  readonly quote?: Quote;
}

/** What the assistant receives of the open chat. */
export interface ReadChat {
  readonly name: string;
  readonly group: boolean;
  readonly messages: readonly ReadMessage[];
}

/**
 * Puts `Person 1`, `Person 2`… in place of senders named only by their
 * phone number, the same person under the same name, so no number reaches
 * a model or an agent (root CLAUDE.md, rule 9).
 */
function maskNumbers(messages: readonly ReadMessage[]): ReadMessage[] {
  const people = new Map<string, string>();
  const named = (name: string): string => {
    if (parseInternationalNumber(name) === undefined) {
      return name;
    }
    const known = people.get(name) ?? `Person ${String(people.size + 1)}`;
    people.set(name, known);
    return known;
  };
  return messages.map((message) => ({
    ...message,
    ...(message.author === undefined ? {} : { author: named(message.author) }),
    ...(message.quote === undefined
      ? {}
      : { quote: { ...message.quote, author: named(message.quote.author) } }),
  }));
}

type RawMessage = Omit<ReadMessage, 'time' | 'author'> & { readonly meta?: string };

/**
 * The time and sender in WhatsApp's copy mark, `[time, date] Sender: `,
 * where it has them; some pages leave the sender out.
 */
function fromMeta({ meta = '', ...message }: RawMessage): ReadMessage {
  const end = meta.indexOf(']');
  if (!meta.startsWith('[') || end < 2) {
    return message;
  }
  const rest = meta.slice(end + 1).trim();
  const author = rest.endsWith(':') ? rest.slice(0, -1).trim() : '';
  return {
    ...message,
    time: meta.slice(1, end).trim(),
    ...(author === '' ? {} : { author }),
  };
}

/**
 * Accepts only the exact shape the reader returns, with no more than
 * `messages` messages: null when no chat is open, undefined for anything
 * else the page made of it.
 */
export function parseActiveChat(value: unknown, messages: number): ReadChat | null | undefined {
  if (value === null) {
    return null;
  }
  if (!Value.Check(ActiveChatSchema, value) || value.messages.length > messages) {
    return undefined;
  }
  return { ...value, messages: maskNumbers(value.messages.map(fromMeta)) };
}
