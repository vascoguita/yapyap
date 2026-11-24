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

/**
 * What a message is when it is not only text, as its markers tell (#723).
 * A call is neither side's: its row says nothing of who called. Media not
 * downloaded yet shows no sign of what it is, and `other` is anything with
 * no words and none of these markers, such as a document or a poll.
 */
const ITEM_KINDS = [
  'call',
  'sticker',
  'animated-emoji',
  'voice',
  'video',
  'photo',
  'media',
  'other',
] as const;

/** What a message is when it is not only text. */
export type ItemKind = (typeof ITEM_KINDS)[number];

interface ReadElement {
  readonly textContent: string | null;
  readonly innerText?: string;
  readonly dataset?: {
    readonly id?: string;
    readonly prePlainText?: string;
    readonly plainText?: string;
    readonly virtualized?: string;
  };
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
  /** The message the user chose to reply to, quoted above the message box (#740). */
  readonly composerQuote: string;
  /** What is in a message that is not only text, each kind with the marker that tells it, first match wins. */
  readonly kinds: readonly (readonly [ItemKind, string])[];
  /** The emoji in a message, drawn as images that keep their text aside. */
  readonly emoji: string;
  /** The bubble every message has, which a row WhatsApp has not drawn yet lacks. */
  readonly bubble: string;
}

interface Limits {
  readonly messages: number;
  readonly text: number;
  readonly name: number;
  readonly quote: number;
  readonly meta: number;
}

/** What a row is, beyond its copy mark: its text, its kind, and its sender when it has no mark. */
interface Item {
  readonly text: string;
  readonly kind?: ItemKind;
  readonly author?: string;
  readonly quote?: Quote;
}

/**
 * Who wrote a message or a quote, from the names in its header, and its
 * `text` without them. Someone not in the user's contacts shows as their
 * own name and their number, each an author of its own; they go by the
 * name as WhatsApp shows it, `~Name`, and their number goes nowhere, not
 * even inside the text (#761). A sender shown only by number keeps it, for
 * the main process to put a stand-in in its place. It runs inside the page
 * beside {@link readActiveChat}, so it stays self-contained.
 */
export function authoredBy(
  names: readonly string[],
  text = '',
): { readonly author: string; readonly said: string } {
  const phone = /^\+?[\d\s().-]{7,}$/;
  const name = names.find((found) => !phone.test(found)) ?? '';
  const numbered = name !== '' && names.some((found) => phone.test(found));
  const said = names.reduce((left, found) => left.replace(found, ''), text).trim();
  return { author: numbered ? `~${name}` : name || (names[0] ?? ''), said };
}

/**
 * Tells what a message row is, given the text read under its copy mark
 * (#723): a message of emoji alone has no mark, and its emoji are images
 * that keep their text aside; a row with a marker says what it is, and one
 * with a bubble but no words and no marker is something else; and without
 * a mark, a group's message still shows its sender above it; a mark names
 * a contact, but someone else only by number, so their `~Name` goes
 * instead (#761). A reply holds the message it quotes, whose text is not
 * the reply's own. It runs
 * inside the page beside {@link readActiveChat}, so it stays self-contained.
 */
export function describeItem(
  row: ReadElement,
  read: string,
  marked: boolean,
  places: ChatPlaces,
  limits: Limits,
  authored = authoredBy,
): Item {
  const all = (selector: string): ReadElement[] =>
    Array.from(row.querySelectorAll?.(selector) ?? []) as ReadElement[];
  const textIn = (found: ReadElement | null | undefined): string =>
    (found?.innerText ?? found?.textContent ?? '').trim();
  const unquoted = (found: ReadElement): boolean => found.closest(places.quoted) === null;
  const emoji = (): string =>
    all(places.emoji)
      .map((image) => image.dataset?.plainText ?? '')
      .join('');
  const kindOf = (text: string): ItemKind | undefined =>
    places.kinds.find(([, selector]) => row.querySelector(selector) !== null)?.[0] ??
    (text === '' && row.querySelector(places.bubble) !== null ? 'other' : undefined);
  const authorOf = (): string => {
    const { author } = authored(all(places.author).filter(unquoted).map(textIn));
    return marked && !author.startsWith('~') ? '' : author;
  };
  const quoteOf = () => {
    const quoted = row.querySelector(places.quoted) as ReadElement | null;
    const names = Array.from(quoted?.querySelectorAll?.(places.author) ?? []) as ReadElement[];
    const { author, said } = authored(names.map(textIn), textIn(quoted));
    const quote = { author: author.slice(0, limits.name), text: said.slice(0, limits.quote) };
    return said === '' ? {} : { quote };
  };
  const text = (read || emoji()).slice(0, limits.text);
  const [kind, author] = [kindOf(text), authorOf().slice(0, limits.name)];
  return {
    text,
    ...(kind === undefined ? {} : { kind }),
    ...(author === '' ? {} : { author }),
    ...quoteOf(),
  };
}

/**
 * The message the user chose to reply to, quoted above the message box
 * (#740), as the quote shows it: its sender, when it names one, and its
 * text; nothing while they reply to none, or to a message without words.
 * A message row may quote a message too, so a quote inside one is never
 * taken for the message box's. It runs inside the page beside
 * {@link readActiveChat}, so it stays self-contained.
 */
export function readReplyingTo(
  doc: ReadDocument,
  places: ChatPlaces,
  limits: Limits,
  authored = authoredBy,
): { readonly replyingTo?: Quote } {
  const textIn = (element: unknown): string => {
    const found = element as ReadElement | null | undefined;
    return (found?.innerText ?? found?.textContent ?? '').trim();
  };
  const quote = (Array.from(doc.querySelectorAll(places.composerQuote)) as ReadElement[]).find(
    (found) => found.closest(places.message) === null,
  );
  const names = Array.from(quote?.querySelectorAll?.(places.author) ?? []).map(textIn);
  const { author, said } = authored(names, textIn(quote));
  const replyingTo = { author: author.slice(0, limits.name), text: said.slice(0, limits.quote) };
  return said === '' ? {} : { replyingTo };
}

/**
 * Reads the open chat as plain data: its name, whether it is a group, and
 * the text of its last `limits.messages` messages, oldest first, each with
 * WhatsApp's copy mark (its time and sender) and the message it quotes,
 * and the message the user replies to, through `replying`.
 * Unlike the probes, it returns page text, so it runs only when the
 * assistant asks, and its result is never logged.
 * It runs inside the page as source text, so it must stay self-contained.
 * A message that is not only text, such as a photo, a sticker or a call,
 * comes with its kind, and its caption as its text if it has one (#723).
 * Rows WhatsApp has not drawn yet, far up the chat, are left out, and a
 * reply's own text and mark are never those of the message it quotes.
 * WhatsApp once marked the account's own messages by their ID, and now
 * only by the tail and delivery status they alone have (#410). The page
 * gets `describe` and `replying` as source text beside it (see
 * {@link activeChatReader}).
 */
export function readActiveChat(
  doc: ReadDocument,
  places: ChatPlaces,
  limits: Limits,
  describe = describeItem,
  replying = readReplyingTo,
): unknown {
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
  const outgoing = (row: ReadElement): boolean =>
    idOf(row).startsWith('true_') || row.querySelector(places.outgoing) !== null;
  const own = (row: ReadElement, selector: string): ReadElement | null =>
    all(row, selector).find(unquoted) ?? (row.querySelector(selector) as ReadElement | null);
  const messageOf = (row: ReadElement) => {
    const body = own(row, places.messageBody) ?? row.querySelector(places.messageText);
    const meta = (own(row, places.messageText)?.dataset?.prePlainText ?? '').slice(0, limits.meta);
    const item = describe(row, textOf(body), meta !== '', places, limits);
    const marked = meta === '' ? {} : { meta };
    const wordless = item.text === '' && item.kind === undefined;
    return wordless ? [] : [{ outgoing: outgoing(row), ...item, ...marked }];
  };
  const rows = all(doc, places.message).filter((row) => row.dataset?.virtualized !== 'true');
  return {
    name: textOf(doc.querySelector(places.chatName)).slice(0, limits.name),
    // IDs named a group's chat until WhatsApp made them bare; now only groups
    // show a sender's name outside a quoted message (#410).
    group:
      rows.some((row) => idOf(row).includes('@g.us')) ||
      all(doc, `${places.message} ${places.author}`).some(unquoted),
    messages: rows.flatMap(messageOf).slice(-limits.messages),
    ...replying(doc, places, limits),
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
  composerQuote: LANDMARKS.composerQuote,
  kinds: [
    ['call', LANDMARKS.callLog],
    ['sticker', LANDMARKS.sticker],
    ['animated-emoji', LANDMARKS.animatedEmoji],
    ['voice', LANDMARKS.voiceMessage],
    ['video', LANDMARKS.video],
    ['photo', LANDMARKS.photo],
    ['media', LANDMARKS.mediaToDownload],
  ],
  emoji: LANDMARKS.emoji,
  bubble: LANDMARKS.bubble,
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
  // Each part runs as source text, so the one they share is handed to them beside it.
  const authored = authoredBy.toString();
  const describe = `(...args) => (${describeItem.toString()})(...args, ${authored})`;
  const replying = `(...args) => (${readReplyingTo.toString()})(...args, ${authored})`;
  return `(${readActiveChat.toString()})(document, ${JSON.stringify(PLACES)}, ${JSON.stringify(limits)}, ${describe}, ${replying})`;
}

const QuoteSchema = Type.Object(
  {
    author: Type.String({ maxLength: MAX_NAME }),
    text: Type.String({ minLength: 1, maxLength: MAX_QUOTE }),
  },
  { additionalProperties: false },
);

const ActiveChatSchema = Type.Object(
  {
    name: Type.String({ maxLength: MAX_NAME }),
    group: Type.Boolean(),
    messages: Type.Array(
      Type.Object(
        {
          outgoing: Type.Boolean(),
          text: Type.String({ maxLength: MAX_TEXT }),
          kind: Type.Optional(
            Type.Unsafe<ItemKind>(Type.Union(ITEM_KINDS.map((kind) => Type.Literal(kind)))),
          ),
          meta: Type.Optional(Type.String({ maxLength: MAX_META })),
          author: Type.Optional(Type.String({ maxLength: MAX_NAME })),
          quote: Type.Optional(QuoteSchema),
        },
        { additionalProperties: false },
      ),
    ),
    replyingTo: Type.Optional(QuoteSchema),
  },
  { additionalProperties: false },
);

/** The message a reply quotes. */
export interface Quote {
  /** Its sender as the quote names them, or '' when it names none. */
  readonly author: string;
  readonly text: string;
}

/** One message of the open chat. */
export interface ReadMessage {
  readonly outgoing: boolean;
  /** What it says, or its caption; empty for a message with no words, which then has a kind. */
  readonly text: string;
  /** What it is when it is not only text. */
  readonly kind?: ItemKind;
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
  /**
   * The message the user chose to reply to, quoted above the message box,
   * which suggestions answer (#740); absent while they reply to none.
   */
  readonly replyingTo?: Quote;
}

/**
 * Puts `Person 1`, `Person 2`… in place of senders named only by their
 * phone number, the same person under the same name, so no number reaches
 * a model or an agent (root CLAUDE.md, rule 8).
 */
function maskNumbers(chat: ReadChat): ReadChat {
  const people = new Map<string, string>();
  const named = (name: string): string => {
    if (parseInternationalNumber(name) === undefined) {
      return name;
    }
    const known = people.get(name) ?? `Person ${String(people.size + 1)}`;
    people.set(name, known);
    return known;
  };
  const masked = (quote: Quote): Quote => ({ ...quote, author: named(quote.author) });
  const messages = chat.messages.map((message) => ({
    ...message,
    ...(message.author === undefined ? {} : { author: named(message.author) }),
    ...(message.quote === undefined ? {} : { quote: masked(message.quote) }),
  }));
  const { replyingTo } = chat;
  return {
    ...chat,
    messages,
    ...(replyingTo === undefined ? {} : { replyingTo: masked(replyingTo) }),
  };
}

type RawMessage = Omit<ReadMessage, 'time'> & { readonly meta?: string };

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
  // The name the page read wins over the mark's, which is only a number for someone not in the contacts (#761).
  return {
    ...message,
    time: meta.slice(1, end).trim(),
    ...(author === '' || message.author !== undefined ? {} : { author }),
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
  if (
    !Value.Check(ActiveChatSchema, value) ||
    value.messages.length > messages ||
    value.messages.some((message) => message.text === '' && message.kind === undefined)
  ) {
    return undefined;
  }
  return maskNumbers({ ...value, messages: value.messages.map(fromMeta) });
}
