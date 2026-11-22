import { ASSISTANT_BAR_BRIDGE } from '../shared/api/assistant-bar-api.ts';
import { edgeTurn, WORKING_EDGE } from '../shared/working-edge.ts';
import { ASSISTANT_ICONS, ASSISTANT_THEME } from './assistant-look.ts';
import {
  paintWhatsAppTheme,
  shadowPart,
  strokeIcon,
  type Actions,
  type Scope,
} from './page-kit.ts';
import { fingerprint } from './incoming.ts';
import { LANDMARKS } from './page-state.ts';

/** YapYap's own words on the bar, in the user's language. */
interface BarLabels {
  readonly label: string;
  readonly suggestions: string;
  readonly use: string;
  readonly collapse: string;
  readonly expand: string;
  /** The folded suggestions' own label. */
  readonly folded: string;
  /** Said to screen readers while suggestions are being written. */
  readonly writing: string;
  readonly close: string;
  /** The working chip's text while the summary is written, also said to screen readers (#705). */
  readonly summarizing: string;
  readonly firstUnread: string;
}

/** A section of the summary: its heading, and its bullets, of which there is at least one. */
interface SummarySection {
  readonly title: string;
  readonly items: readonly string[];
}

/** The summary of the unread messages, with its words in the user's language (#705). */
interface SummaryContent {
  readonly stage: 'offer' | 'working' | 'shown';
  /** How many messages were unread, which Show First Unread counts back from the end of the chat. */
  readonly count: number;
  /** The offer's chip. */
  readonly offer: string;
  /** The card's heading, which names it. */
  readonly title: string;
  readonly sections: readonly SummarySection[];
  /** That it covers only the newest messages, as the history limit allows; empty when it covers all. */
  readonly covers: string;
}

/** Everything the bar shows, as plain JSON: YapYap's labels and the assistant's text. */
export interface BarContent {
  readonly visible: boolean;
  readonly labels: BarLabels;
  readonly suggestions: readonly string[];
  /** The chat the bar follows, by its header's fingerprint; null while none is open. */
  readonly chat: string | null;
  /** The user folded the suggestions away (#729). */
  readonly collapsed: boolean;
  /** Suggestions are being written (#703). */
  readonly writing: boolean;
  /** What a rewrite did, or what keeps the assistant from answering, with its one button. */
  readonly notice: {
    readonly text: string;
    readonly button: { readonly id: string; readonly label: string } | null;
  } | null;
  /** The summary of the unread messages, offered, being written or shown; null for none (#705). */
  readonly summary: SummaryContent | null;
}

/** Where the bar goes and what it keeps, fixed for every render. */
interface BarPlaces {
  /** The open chat's message box row, which the bar sits right above, and the box itself. */
  readonly footer: string;
  readonly field: string;
  /** The message the user replies to, which WhatsApp quotes over the space above the message box. */
  readonly quote: string;
  /** The open chat and a message in it, to find the list the bar takes room from. */
  readonly conversation: string;
  readonly message: string;
  /** The open chat's name in its header, fingerprinted as the look at the page does. */
  readonly chatName: string;
  /** The adapter world's global that holds the bar between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the bar's actions. */
  readonly bridge: string;
  readonly style: string;
  readonly icons: {
    readonly sparkle: string;
    readonly close: string;
    readonly fold: string;
    readonly unfold: string;
  };
}

/** The few DOM features the bar uses; the main process compiles this without DOM types. */
interface BarNode {
  textContent: string | null;
  hidden: boolean;
  scrollTop: number;
  readonly getRootNode: () => unknown;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly offsetHeight: number;
  readonly parentElement: BarNode | null;
  readonly ownerDocument: BarDocument;
  readonly previousElementSibling: unknown;
  readonly style: {
    order: string;
    position: string;
    zIndex: string;
    display: string;
    insetBlockStart: string;
    maxBlockSize: string;
  };
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  append(...nodes: BarNode[]): void;
  prepend(...nodes: BarNode[]): void;
  replaceChildren(...nodes: BarNode[]): void;
  focus(): void;
  scrollIntoView(options: { readonly block: 'start' }): void;
  addEventListener(type: string, listener: (event: BarEvent) => void): void;
  closest(selectors: string): BarNode | null;
  getBoundingClientRect(): { readonly top: number; readonly height: number };
  before(node: BarNode): void;
  remove(): void;
  attachShadow(init: { readonly mode: 'closed' }): BarNode;
}

interface BarEvent {
  readonly isTrusted: boolean;
  readonly target: unknown;
  readonly key?: string;
  stopPropagation(): void;
}

interface BarDocument {
  querySelector(selectors: string): unknown;
  querySelectorAll(selectors: string): ArrayLike<BarNode>;
  createElement(tag: string): BarNode;
  createElementNS(namespace: string, tag: string): BarNode;
  addEventListener(type: string, listener: () => void, capture: boolean): void;
}

/** Which of the bar's rows hide, and whether the whole bar does, with nothing in it. */
interface BarHidden {
  readonly chips: boolean;
  readonly folded: boolean;
  readonly card: boolean;
  readonly bar: boolean;
}

/** The summary's card, over the end of the chat (#705). */
interface SummaryParts {
  readonly card: BarNode;
  readonly cardTitle: BarNode;
  readonly cardClose: BarNode;
  /** The sections, which scroll inside the card. */
  readonly cardBody: BarNode;
  readonly covers: BarNode;
  readonly firstUnread: BarNode;
}

/** The parts of the bar that change with its content. */
interface BarParts extends SummaryParts {
  readonly bar: BarNode;
  readonly notice: BarNode;
  readonly text: BarNode;
  readonly action: BarNode;
  readonly close: BarNode;
  readonly chips: BarNode;
  readonly list: BarNode;
  /** Tells screen readers that suggestions are being written. */
  readonly status: BarNode;
  readonly collapse: BarNode;
  /** The row the suggestions fold into, with the button that shows them again. */
  readonly folded: BarNode;
  readonly expand: BarNode;
  readonly foldLabel: BarNode;
}

/** The bar between renders: its host in WhatsApp's page, and what it last showed. */
interface BarStore {
  readonly host: BarNode;
  readonly parts: BarParts;
  key: string | null;
  /** Shows the suggestions only while the message box is empty, and the bar only with something in it. */
  readonly sync: () => void;
}

/** What a render changes: the content, and whether the bar goes back above the message box. */
interface BarRefresh {
  readonly store: BarStore;
  readonly shown: BarContent;
  readonly placed: boolean;
  readonly place: () => void;
}

/** The bar's helpers, passed in because each runs as its own source text. */
export interface BarKit {
  readonly align: (scope: Scope, host: BarNode, footer: BarNode) => void;
  readonly lift: (footer: BarNode, places: BarPlaces) => number;
  readonly paint: typeof paintWhatsAppTheme;
  readonly room: (scope: Scope, places: BarPlaces, bar: BarNode, change: () => void) => void;
  readonly build: (doc: BarDocument, scope: Scope, places: BarPlaces, kit: BarKit) => BarStore;
  readonly rows: (
    doc: BarDocument,
    bar: BarNode,
    places: BarPlaces,
    kit: BarKit,
  ) => Omit<BarParts, keyof SummaryParts>;
  readonly card: (doc: BarDocument, bar: BarNode, places: BarPlaces, kit: BarKit) => SummaryParts;
  readonly summary: (
    doc: BarDocument,
    parts: BarParts,
    content: BarContent,
    places: BarPlaces,
    kit: BarKit,
  ) => void;
  readonly sections: (
    doc: BarDocument,
    parts: BarParts,
    summary: SummaryContent,
    labels: BarLabels,
  ) => void;
  readonly fit: (doc: BarDocument, places: BarPlaces, parts: BarParts) => void;
  readonly act: (
    doc: BarDocument,
    scope: Scope,
    places: BarPlaces,
    control: BarNode,
    kit: BarKit,
  ) => void;
  readonly firstUnread: (doc: BarDocument, places: BarPlaces, count: number) => void;
  readonly close: (doc: BarDocument, scope: Scope, places: BarPlaces) => void;
  readonly node: typeof shadowPart;
  readonly show: (
    doc: BarDocument,
    scope: Scope,
    places: BarPlaces,
    store: Pick<BarStore, 'host' | 'parts'>,
    kit: BarKit,
  ) => void;
  readonly wire: (shadow: BarNode, scope: Scope, places: BarPlaces, kit: BarKit) => void;
  readonly update: (doc: BarDocument, parts: BarParts, content: BarContent) => void;
  readonly notice: (parts: BarParts, notice: BarContent['notice']) => void;
  readonly here: (
    doc: BarDocument,
    content: BarContent,
    places: BarPlaces,
    hash: (text: string) => string,
  ) => BarContent;
  readonly fingerprint: (text: string) => string;
  readonly hidden: (parts: BarParts) => BarHidden;
  readonly mark: (parts: BarParts, content: BarContent) => void;
  readonly refresh: (
    doc: BarDocument,
    scope: Scope,
    places: BarPlaces,
    change: BarRefresh,
    kit: BarKit,
  ) => void;
  readonly icon: typeof strokeIcon;
}

/** Where a render left the bar. */
export type BarPlacement = 'away' | 'kept' | 'placed';

/**
 * Keeps the assistant's bar right above the open chat's message box, so
 * the conversation moves up to make room (ADR 0013). Runs in the adapter's
 * isolated world as source text, so it uses only its arguments. WhatsApp
 * drops the bar when it redraws a chat, so every render puts the same bar
 * back; it changes the bar only when its content changed. The page tells
 * it when the user types, so suggestions go as soon as the user writes
 * their own. It reports only where the bar is.
 */
export function renderAssistantBar(
  doc: BarDocument,
  scope: Scope,
  content: BarContent,
  places: BarPlaces,
  kit: BarKit,
): BarPlacement {
  const footer = doc.querySelector(places.footer) as BarNode | null;
  const kept = scope[places.store] as BarStore | undefined;
  if (!content.visible || footer === null) {
    kept?.host.remove();
    return 'away';
  }
  const store = kept ?? kit.build(doc, scope, places, kit);
  scope[places.store] = store;
  const placed = footer.previousElementSibling !== store.host;
  const shown = kit.here(doc, content, places, kit.fingerprint);
  const place = (): void => {
    footer.before(store.host);
  };
  kit.refresh(doc, scope, places, { store, shown, placed, place }, kit);
  // Only drawn higher: WhatsApp already leaves the quote's height free above the box, so the chat keeps its own.
  store.host.style.insetBlockStart = `${String(-kit.lift(footer, places))}px`;
  store.sync();
  kit.fit(doc, places, store.parts);
  kit.align(scope, store.host, footer);
  kit.paint(scope, store.host, footer);
  return placed ? 'placed' : 'kept';
}

/**
 * What the bar shows in the chat open now: nothing of another chat's. The
 * main process learns that another chat opened only at its next look, up
 * to a second and a half later, while WhatsApp draws the new chat at once
 * and the bar comes back into it within a second, so the page tells
 * itself (#730). It names the open chat exactly as the look does, by the
 * fingerprint of its header's `textContent`: the laid-out `innerText` can
 * read differently from one moment to the next, which hid suggestions made
 * for the very chat on screen (#741).
 */
export function assistantBarHere(
  doc: BarDocument,
  content: BarContent,
  places: BarPlaces,
  hash: (text: string) => string,
): BarContent {
  const header = doc.querySelector(places.chatName) as BarNode | null;
  const open = header === null ? null : hash(header.textContent ?? '');
  return content.chat === null || content.chat === open
    ? content
    : { ...content, suggestions: [], notice: null, summary: null };
}

/**
 * Shows new content, and puts the bar back above a message box WhatsApp
 * drew anew, keeping the chat where the user left it. Putting it back
 * belongs inside that change: the chat's list gets shorter as the bar comes
 * in, so a chat WhatsApp opened at its end, measured after, read as
 * scrolled back by the bar's height and stayed there, its last messages
 * hidden (#743). Content that did not change is left alone.
 */
export function refreshAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  { store, shown, placed, place }: BarRefresh,
  kit: BarKit,
): void {
  const key = JSON.stringify(shown);
  const fresh = store.key !== key;
  store.key = key;
  if (fresh || placed) {
    kit.room(scope, places, store.parts.bar, () => {
      if (placed) {
        place();
      }
      if (fresh) {
        kit.update(doc, store.parts, shown);
        kit.summary(doc, store.parts, shown, places, kit);
        kit.mark(store.parts, shown);
        kit.notice(store.parts, shown.notice);
      }
    });
  }
}

/**
 * Puts the bar where the message box is in WhatsApp's layout. WhatsApp
 * orders the open chat's parts with flexbox `order` and lays a positioned
 * wallpaper over the chat, so the bar takes the message box's order and
 * stacking, read anew on every render in case WhatsApp changes them (#466).
 */
export function alignAssistantBar(scope: Scope, host: BarNode, footer: BarNode): void {
  const computed = scope['getComputedStyle'] as (node: BarNode) => {
    readonly order: string;
    readonly zIndex: string;
  };
  const { order, zIndex } = computed.call(scope, footer);
  host.style.order = order;
  host.style.position = 'relative';
  host.style.zIndex = zIndex;
}

/**
 * How far above the message box WhatsApp's quote of the message the user
 * replies to reaches, in whole pixels, or 0 without one. WhatsApp draws it
 * over the space above the box, where the bar sits, which hid the
 * suggestions, and leaves as much free at the end of the chat for it; the
 * bar is drawn that much higher, into that free space (#740). The quote's own panel is
 * one of its ancestors in the box's footer, which may be taller than the
 * quote, so the highest of them counts; one not laid out counts for none.
 */
export function assistantBarLift(footer: BarNode, places: BarPlaces): number {
  const bottom = footer.getBoundingClientRect().top;
  let top = bottom;
  for (
    let node = footer.ownerDocument.querySelector(places.quote) as BarNode | null;
    node !== null && node !== footer;
    node = node.parentElement
  ) {
    const box = node.getBoundingClientRect();
    top = box.height > 0 ? Math.min(top, box.top) : top;
  }
  return Math.round(bottom - top);
}

/**
 * Makes `change` to the bar and keeps the chat where the user left it. The
 * bar takes its room from the message list, so the list gets shorter as the
 * bar grows and taller as it shrinks (#607). The list keeps its distance
 * from the end of the chat, so a chat read to its last message still shows
 * it, whichever way the bar changed. Browsers already pull a list scrolled
 * to its end back as it grows, so moving it by the bar's change in height
 * would move it twice (#616). The list is the nearest scrolling box around a
 * message, inside the open chat. Measuring forces a layout, so it measures
 * only around a change.
 */
export function holdAssistantBarRoom(
  scope: Scope,
  places: BarPlaces,
  bar: BarNode,
  change: () => void,
): void {
  const computed = scope['getComputedStyle'] as (node: BarNode) => { readonly overflowY: string };
  const inChat = (node: BarNode | null): node is BarNode =>
    node !== null && node.closest(places.conversation) !== null;
  const scrolls = (node: BarNode): boolean =>
    ['auto', 'scroll'].includes(computed.call(scope, node).overflowY);
  let list = bar.ownerDocument.querySelector(places.message) as BarNode | null;
  while (inChat(list) && !scrolls(list)) {
    list = list.parentElement;
  }
  if (!inChat(list)) {
    change();
    return;
  }
  const fromEnd = list.scrollHeight - list.scrollTop - list.clientHeight;
  change();
  list.scrollTop = list.scrollHeight - list.clientHeight - fromEnd;
}

/**
 * Builds the bar in a closed shadow root: WhatsApp's scripts cannot reach
 * into it to read what the assistant wrote, and its styles cannot restyle
 * it. One row says what a rewrite did, with Undo; the other holds the
 * suggestions, which show only while the message box is empty. The page
 * tells the bar when the user types, once, as the bar is built once per
 * world; nothing about the draft leaves the page.
 */
export function buildAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  kit: BarKit,
): BarStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  kit.node(doc, 'style', 'style', shadow).textContent = places.style;
  const bar = kit.node(doc, 'section', 'bar', shadow);
  const parts: BarParts = {
    ...kit.rows(doc, bar, places, kit),
    ...kit.card(doc, bar, places, kit),
  };
  const { notice, chips, folded } = parts;
  // Nothing shows until the first render says what to, so the room it takes is measured from none.
  notice.hidden = true;
  chips.hidden = true;
  folded.hidden = true;
  parts.card.hidden = true;
  host.style.display = 'none';
  kit.wire(shadow, scope, places, kit);
  const store: BarStore = {
    host,
    parts,
    key: null,
    sync: () => {
      kit.show(doc, scope, places, store, kit);
    },
  };
  doc.addEventListener('input', store.sync, true);
  // WhatsApp's editor deletes without an `input` event, so a key let go looks again.
  doc.addEventListener('keyup', store.sync, true);
  return store;
}

/**
 * The bar's rows, each starting with the sparkle: the notice, with its
 * text, its button and close; the suggestions, with what tells screen
 * readers they are being written, and the button that folds them away;
 * and the one button they fold into, which shows them again (#729).
 */
export function assistantBarRows(
  doc: BarDocument,
  bar: BarNode,
  places: BarPlaces,
  kit: BarKit,
): Omit<BarParts, keyof SummaryParts> {
  const make = (tag: string, name: string, parent: BarNode, action?: string): BarNode =>
    kit.node(doc, tag, name, parent, action);
  const notice = make('div', 'row notice', bar);
  notice.setAttribute('role', 'status');
  notice.append(kit.icon(doc, places.icons.sparkle, 'mark'));
  const chips = make('div', 'row chips', bar);
  const folded = make('div', 'row folded', bar);
  const parts = {
    bar,
    notice,
    text: make('span', 'text', notice),
    action: make('button', 'action', notice, 'button'),
    close: make('button', 'icon', notice, 'button'),
    chips,
    // First in its row, where the button the suggestions fold into is too (#729).
    collapse: make('button', 'fold', chips, 'collapse'),
    list: make('ul', 'list', chips),
    status: make('span', 'status', chips),
    folded,
    expand: make('button', 'fold', folded, 'expand'),
    foldLabel: doc.createElement('span'),
  };
  parts.status.setAttribute('role', 'status');
  parts.foldLabel.setAttribute('class', 'fold-label');
  parts.close.dataset['id'] = 'close';
  const { sparkle, close, fold, unfold } = places.icons;
  parts.close.append(kit.icon(doc, close, 'cross'));
  parts.collapse.append(kit.icon(doc, sparkle, 'mark'), kit.icon(doc, fold, 'chevron'));
  parts.expand.append(
    kit.icon(doc, sparkle, 'mark'),
    parts.foldLabel,
    kit.icon(doc, unfold, 'chevron'),
  );
  return parts;
}

/**
 * The summary's card (#705): a region named by its heading, which starts
 * with the sparkle and ends with a cross to close it; the sections, which
 * scroll inside it; and its foot, which says how much it covers and shows
 * the first unread message. It takes the focus when it opens, so it can
 * be focused itself.
 */
export function assistantSummaryCard(
  doc: BarDocument,
  bar: BarNode,
  places: BarPlaces,
  kit: BarKit,
): SummaryParts {
  const card = kit.node(doc, 'section', 'card', bar);
  card.setAttribute('role', 'region');
  card.setAttribute('aria-labelledby', 'summary-title');
  card.setAttribute('tabindex', '-1');
  card.dataset['card'] = 'true';
  const head = kit.node(doc, 'div', 'card-head', card);
  head.append(kit.icon(doc, places.icons.sparkle, 'mark'));
  const cardTitle = kit.node(doc, 'h2', 'card-title', head);
  cardTitle.setAttribute('id', 'summary-title');
  const cardClose = kit.node(doc, 'button', 'icon', head, 'closeSummary');
  cardClose.append(kit.icon(doc, places.icons.close, 'cross'));
  const cardBody = kit.node(doc, 'div', 'card-body', card);
  const foot = kit.node(doc, 'div', 'card-foot', card);
  const covers = kit.node(doc, 'p', 'covers', foot);
  const firstUnread = kit.node(doc, 'button', 'action', foot, 'firstUnread');
  return { card, cardTitle, cardClose, cardBody, covers, firstUnread };
}

/**
 * Which of the bar's rows hide: the suggestions while they are folded
 * away, or while there are none and none are being written; the button
 * they fold into unless they are folded and there are some to show again;
 * and the summary's card unless it shows, in their place (#705). The offer
 * of a summary counts as one of the suggestions. Neither hides while the
 * user types (#743).
 */
export function assistantBarHidden(parts: BarParts): BarHidden {
  const { items = '0', writing } = parts.list.dataset;
  const collapsed = parts.bar.dataset['collapsed'] === 'true';
  const card = parts.bar.dataset['summary'] !== 'shown';
  const nothing = items === '0' && writing !== 'true';
  const chips = collapsed || nothing || !card;
  const folded = !collapsed || items === '0' || !card;
  return { chips, folded, card, bar: [chips, folded, card, parts.notice.hidden].every(Boolean) };
}

/**
 * Shows the suggestions only while the message box is empty, and the bar
 * only with something in it. Measuring forces a layout, and the bar
 * renders about once a second, so only a change in what shows, which alone
 * moves its height, measures it.
 */
export function showAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  { host, parts }: Pick<BarStore, 'host' | 'parts'>,
  kit: BarKit,
): void {
  const field = doc.querySelector(places.field) as BarNode | null;
  // They stay while the user types, a little quieter (#743).
  parts.bar.dataset['typed'] = String((field?.textContent ?? '').trim() !== '');
  const hidden = kit.hidden(parts);
  const display = hidden.bar ? 'none' : '';
  const same = (['chips', 'folded', 'card'] as const).every(
    (row) => parts[row].hidden === hidden[row],
  );
  if (!same || host.style.display !== display) {
    kit.room(scope, places, parts.bar, () => {
      parts.chips.hidden = hidden.chips;
      parts.folded.hidden = hidden.folded;
      parts.card.hidden = hidden.card;
      host.style.display = display;
    });
  }
  // The card takes the focus as it opens (#705).
  if (parts.card.dataset['fresh'] === 'true' && !parts.card.hidden) {
    parts.card.dataset['fresh'] = 'false';
    parts.card.focus();
  }
}

/**
 * Acts on the user's clicks and keys, never on ones a page script made up,
 * and keeps keys pressed on the bar from reaching WhatsApp's own
 * shortcuts. Escape in the summary's card closes it (#705).
 */
export function wireAssistantBar(
  shadow: BarNode,
  scope: Scope,
  places: BarPlaces,
  kit: BarKit,
): void {
  const doc = shadow.ownerDocument;
  shadow.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const inCard = event.isTrusted && (event.target as BarNode).closest('[data-card]') !== null;
    if (inCard && event.key === 'Escape') {
      kit.close(doc, scope, places);
    }
  });
  shadow.addEventListener('click', (event) => {
    const control = event.isTrusted ? (event.target as BarNode).closest('[data-action]') : null;
    if (control !== null) {
      kit.act(doc, scope, places, control, kit);
    }
  });
}

/**
 * Does what the user clicked: Show First Unread scrolls the chat, in the
 * page alone; closing the summary also gives the message box the focus
 * back; anything else goes to the main process. A suggestion is named by
 * its index, the notice's button by its ID; folding takes nothing.
 */
export function actOnAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  control: BarNode,
  kit: BarKit,
): void {
  const { action, index, id, count } = control.dataset;
  const inPage: Readonly<Record<string, () => void>> = {
    firstUnread: () => {
      kit.firstUnread(doc, places, Number(count));
    },
    closeSummary: () => {
      kit.close(doc, scope, places);
    },
  };
  const own = Object.hasOwn(inPage, String(action)) ? inPage[String(action)] : undefined;
  if (own !== undefined) {
    own();
    return;
  }
  const act = (...value: [unknown?]): void => {
    ((scope[places.bridge] ?? {}) as Actions)[String(action)]?.(...value);
  };
  if (index !== undefined) {
    act(Number(index));
  } else if (id === undefined) {
    act();
  } else {
    act(id);
  }
}

/**
 * Closes the summary, and gives the message box the focus back, as the
 * card had taken it (#705).
 */
export function closeAssistantSummary(doc: BarDocument, scope: Scope, places: BarPlaces): void {
  ((scope[places.bridge] ?? {}) as Actions)['closeSummary']?.();
  (doc.querySelector(places.field) as BarNode | null)?.focus();
}

/**
 * Scrolls the chat so its first unread message shows at the top (#705):
 * the `count`-th message from the end among those WhatsApp drew, or the
 * oldest it drew when the chat holds fewer. It goes by the messages' rows
 * alone, and reads none of their text.
 */
export function showFirstUnread(doc: BarDocument, places: BarPlaces, count: number): void {
  const rows = Array.from(doc.querySelectorAll(places.message)).filter(
    (row) => row.dataset['virtualized'] !== 'true',
  );
  (rows.at(-count) ?? rows[0])?.scrollIntoView({ block: 'start' });
}

/**
 * Keeps the summary's card at most about 40% as high as the open chat, so
 * the chat shows above it; the card scrolls inside. It is drawn over the
 * end of the chat, which keeps its height. Measuring forces a layout, so
 * it measures only while the card shows.
 */
export function fitAssistantSummary(doc: BarDocument, places: BarPlaces, parts: BarParts): void {
  const chat = doc.querySelector(places.conversation) as BarNode | null;
  if (!parts.card.hidden && chat !== null) {
    parts.card.style.maxBlockSize = `${String(Math.round(chat.clientHeight * 0.4))}px`;
  }
}

/** Shows new content, writing the assistant's text only as text, never as markup. */
export function updateAssistantBar(doc: BarDocument, parts: BarParts, content: BarContent): void {
  const { labels, suggestions } = content;
  const named = (node: BarNode, name: string): void => {
    node.setAttribute('aria-label', name);
    node.setAttribute('title', name);
  };
  parts.bar.setAttribute('aria-label', labels.label);
  parts.chips.setAttribute('aria-label', labels.suggestions);
  named(parts.collapse, labels.collapse);
  named(parts.expand, labels.expand);
  named(parts.close, labels.close);
  parts.foldLabel.textContent = labels.folded;
  // While suggestions are written, three blank chips hold their place (#703).
  const writing = content.writing && suggestions.length === 0;
  const chip = (text: string, index: number): BarNode => {
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.setAttribute('class', 'chip');
    button.setAttribute('type', 'button');
    button.setAttribute('title', `${text}\n${labels.use}`);
    button.dataset['action'] = 'use';
    button.dataset['index'] = String(index);
    button.textContent = text;
    item.append(button);
    return item;
  };
  // One chip says they are being written; the status tells screen readers instead (#743).
  const blank = (): BarNode => {
    const item = doc.createElement('li');
    item.setAttribute('class', 'placeholder working');
    item.setAttribute('aria-hidden', 'true');
    item.textContent = labels.writing;
    return item;
  };
  const items = writing ? [blank()] : suggestions.map((text, index) => chip(text, index));
  parts.list.replaceChildren(...items);
}

/**
 * Marks what the row is doing, for its styles, for the rows that show, and
 * for screen readers: folded away or not (#729), and how many suggestions
 * there are, or that they are being written (#703).
 */
export function markAssistantBar(parts: BarParts, content: BarContent): void {
  const { summary, labels } = content;
  const writing = content.writing && content.suggestions.length === 0;
  const offered = summary !== null && summary.stage !== 'shown';
  const summarizing = summary?.stage === 'working';
  parts.bar.dataset['collapsed'] = String(content.collapsed);
  parts.collapse.setAttribute('aria-expanded', 'true');
  parts.expand.setAttribute('aria-expanded', 'false');
  parts.list.dataset['items'] = String(content.suggestions.length + Number(offered));
  parts.list.dataset['writing'] = String(writing);
  parts.list.setAttribute('aria-busy', String(writing || summarizing));
  const status = summarizing ? labels.summarizing : labels.writing;
  parts.status.textContent = writing || summarizing ? status : '';
}

/**
 * Shows the summary (#705): offered, as a chip with the sparkle, first in
 * the suggestions' row; being written, as one chip that says so, with the
 * light round its edge; shown, in its card. The card marks itself fresh as
 * it opens, so the look at what shows that follows gives it the focus.
 */
export function summaryAssistantBar(
  doc: BarDocument,
  parts: BarParts,
  content: BarContent,
  places: BarPlaces,
  kit: BarKit,
): void {
  const { summary } = content;
  const stage = summary?.stage ?? 'none';
  const opened = stage === 'shown' && parts.bar.dataset['summary'] !== 'shown';
  parts.card.dataset['fresh'] = String(opened);
  parts.bar.dataset['summary'] = stage;
  if (summary === null) {
    return;
  }
  if (summary.stage === 'shown') {
    kit.sections(doc, parts, summary, content.labels);
    return;
  }
  const item = doc.createElement('li');
  if (summary.stage === 'offer') {
    const chip = kit.node(doc, 'button', 'chip offer', item, 'summarize');
    const words = doc.createElement('span');
    words.textContent = summary.offer;
    chip.append(kit.icon(doc, places.icons.sparkle, 'mark'), words);
  } else {
    item.setAttribute('class', 'placeholder working');
    item.setAttribute('aria-hidden', 'true');
    item.textContent = content.labels.summarizing;
  }
  parts.list.prepend(item);
}

/**
 * Fills the summary's card: its heading, only the sections that have
 * something, each a list, as text, never markup, and its foot.
 */
export function assistantSummarySections(
  doc: BarDocument,
  parts: BarParts,
  summary: SummaryContent,
  labels: BarLabels,
): void {
  parts.cardTitle.textContent = summary.title;
  parts.cardClose.setAttribute('aria-label', labels.close);
  parts.cardClose.setAttribute('title', labels.close);
  const sectionOf = ({ title, items }: SummarySection): BarNode => {
    const section = doc.createElement('div');
    const heading = doc.createElement('h3');
    heading.textContent = title;
    const list = doc.createElement('ul');
    for (const text of items) {
      const item = doc.createElement('li');
      item.textContent = text;
      list.append(item);
    }
    section.append(heading, list);
    return section;
  };
  parts.cardBody.replaceChildren(...summary.sections.map(sectionOf));
  parts.cardBody.scrollTop = 0;
  parts.covers.textContent = summary.covers;
  parts.covers.hidden = summary.covers === '';
  parts.firstUnread.textContent = labels.firstUnread;
  parts.firstUnread.dataset['count'] = String(summary.count);
}

/** Shows what a rewrite did, or what keeps the assistant from answering, with its one button. */
export function noticeAssistantBar(parts: BarParts, notice: BarContent['notice']): void {
  const { text, button } = notice ?? { text: '', button: null };
  parts.notice.hidden = notice === null;
  parts.text.textContent = text;
  parts.action.hidden = button === null;
  parts.action.textContent = button?.label ?? '';
  parts.action.dataset['id'] = button?.id ?? '';
  // Undo answers the rewrite the notice is about, which goes once the user sends or undoes it.
  parts.close.hidden = button?.id === 'undo';
}

/**
 * The bar's own styles, inside its shadow root. There is no band: the
 * notice and the suggestions float on the chat's wallpaper above WhatsApp's
 * message box, lined up with its edges (#743). They are flat pills in the
 * assistant's tint, as its rewrite button is, never white and shadowed:
 * that is how WhatsApp draws messages, and they read as ones received. First in the suggestions' row is the one
 * control that folds them away and, folded, shows them again, in the same
 * place either way (#729). The chips wrap onto more lines, each at most two
 * lines high (#709); while they are written, one chip says so with a light
 * travelling round its edge (#703, `WORKING_EDGE`); while the user types,
 * they stay, a little quieter. Logical properties only, so it mirrors for
 * right-to-left languages (ADR 0012).
 */
const BAR_STYLE = `${ASSISTANT_THEME}${WORKING_EDGE}
:host { display: block; }
[hidden] { display: none !important; }
.bar {
  display: flex; flex-direction: column; gap: var(--space-2); box-sizing: border-box;
  padding-block: 6px var(--space-2); padding-inline: var(--space-4); background: transparent;
  color: var(--text); font-family: inherit; font-size: var(--font-body);
}
.row { display: flex; align-items: flex-start; gap: var(--space-2); min-inline-size: 0; }
svg {
  flex: none; inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}
.mark { color: var(--ai); }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
.notice {
  align-self: flex-start; align-items: center; gap: var(--space-2); max-inline-size: 100%;
  min-block-size: 40px; box-sizing: border-box; padding-inline: var(--space-3) var(--space-1);
  border: 1px solid var(--ai-border); border-radius: 20px; background: var(--ai-tint);
}
.text { flex: 1; min-inline-size: 0; padding-block: var(--space-2); overflow-wrap: anywhere; }
.action {
  flex: none; min-block-size: 32px; padding-inline: var(--space-3);
  border: 1px solid var(--ai-border); border-radius: var(--radius-pill); background: var(--chip); color: var(--ai); font-weight: 600;
}
.action:hover { background: var(--ai-tint); }
.icon {
  display: grid; flex: none; place-items: center; inline-size: 36px; block-size: 36px;
  padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted);
}
.icon:hover { background: var(--hover); }
.list {
  display: flex; flex: 1; flex-wrap: wrap; gap: var(--space-2); min-inline-size: 0; margin: 0;
  padding: 0; list-style: none;
}
li { display: flex; min-inline-size: 0; max-inline-size: 100%; }
.chip {
  display: -webkit-box; min-block-size: 36px; max-inline-size: 100%; padding-block: 7px;
  padding-inline: 14px; overflow: hidden; border: 1px solid var(--ai-border); border-radius: 20px;
  background: var(--ai-tint); color: var(--text); font-size: var(--font-body); line-height: 1.3;
  text-align: start; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
  overflow-wrap: anywhere;
}
.chip:hover { background: var(--ai-hover); }
.placeholder {
  --edge: var(--ai); --edge-track: var(--chip-border); --edge-fill: var(--chip);
  --edge-turn: ${edgeTurn(184, 36)};
  flex: none; align-items: center; box-sizing: border-box; inline-size: 184px; block-size: 36px;
  padding-inline: 14px; overflow: hidden; border: 0; border-radius: var(--radius-pill);
  background: var(--chip); color: var(--muted); white-space: nowrap;
  text-overflow: ellipsis;
}
.status {
  position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%);
  white-space: nowrap;
}
.fold {
  display: inline-flex; flex: none; align-items: center; gap: var(--space-1);
  min-block-size: 36px; min-inline-size: 36px; box-sizing: border-box; padding-inline: 9px;
  border: 1px solid var(--ai-border); border-radius: var(--radius-pill); background: var(--ai-tint);
  color: var(--ai); font-size: var(--font-body);
}
.fold:hover { background: var(--ai-hover); }
.fold svg { inline-size: 18px; block-size: 18px; }
.fold-label { padding-inline: 2px 4px; }
.bar[data-typed='true'] .chips { opacity: 0.7; }
.bar[data-typed='true'] .chips:hover, .bar[data-typed='true'] .chips:focus-within { opacity: 1; }
.offer { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--ai); font-weight: 600; }
.offer svg { inline-size: 18px; block-size: 18px; }
.bar { position: relative; }
.bar[data-summary='shown'] { padding-block-start: 0; }
.card {
  position: absolute; inset-inline: var(--space-4); inset-block-end: 100%; display: flex;
  flex-direction: column; box-sizing: border-box; overflow: hidden;
  border: 1px solid var(--ai-border); border-radius: 20px; background: var(--ai-tint);
}
.card:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
.card-head {
  display: flex; flex: none; align-items: center; gap: var(--space-2);
  padding-block: var(--space-1); padding-inline: var(--space-3) var(--space-1);
}
.card-title { flex: 1; min-inline-size: 0; margin: 0; font-size: var(--font-body); font-weight: 600; }
.card-body { flex: 1 1 auto; min-block-size: 0; overflow-y: auto; padding-inline: var(--space-3); }
.card-body h3 { margin-block: var(--space-2) var(--space-1); color: var(--ai); font-size: var(--font-hint); font-weight: 600; }
.card-body ul { margin: 0; padding-inline-start: var(--space-4); }
.card-body li { display: list-item; margin-block-end: var(--space-1); overflow-wrap: anywhere; line-height: 1.35; }
.card-foot {
  display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--space-2); padding-block: var(--space-2); padding-inline: var(--space-3);
}
.covers { flex: 1 1 12em; margin: 0; color: var(--muted); font-size: var(--font-hint); }
.card-foot .action { margin-inline-start: auto; }
`;

const PLACES: BarPlaces = {
  footer: LANDMARKS.composerFooter,
  field: LANDMARKS.composer,
  quote: LANDMARKS.composerQuote,
  conversation: LANDMARKS.conversation,
  message: LANDMARKS.message,
  chatName: LANDMARKS.chatName,
  store: 'yapyapAssistantBarView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: BAR_STYLE,
  icons: {
    sparkle: ASSISTANT_ICONS.sparkle,
    close: ASSISTANT_ICONS.close,
    fold: ASSISTANT_ICONS.fold,
    unfold: ASSISTANT_ICONS.caret,
  },
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function assistantBarRender(content: BarContent): string {
  const kit = [
    `align: ${alignAssistantBar.toString()}`,
    `lift: ${assistantBarLift.toString()}`,
    `paint: ${paintWhatsAppTheme.toString()}`,
    `room: ${holdAssistantBarRoom.toString()}`,
    `build: ${buildAssistantBar.toString()}`,
    `rows: ${assistantBarRows.toString()}`,
    `node: ${shadowPart.toString()}`,
    `show: ${showAssistantBar.toString()}`,
    `wire: ${wireAssistantBar.toString()}`,
    `update: ${updateAssistantBar.toString()}`,
    `notice: ${noticeAssistantBar.toString()}`,
    `icon: ${strokeIcon.toString()}`,
    `here: ${assistantBarHere.toString()}`,
    `fingerprint: ${fingerprint.toString()}`,
    `hidden: ${assistantBarHidden.toString()}`,
    `mark: ${markAssistantBar.toString()}`,
    `refresh: ${refreshAssistantBar.toString()}`,
    `card: ${assistantSummaryCard.toString()}`,
    `summary: ${summaryAssistantBar.toString()}`,
    `sections: ${assistantSummarySections.toString()}`,
    `fit: ${fitAssistantSummary.toString()}`,
    `act: ${actOnAssistantBar.toString()}`,
    `firstUnread: ${showFirstUnread.toString()}`,
    `close: ${closeAssistantSummary.toString()}`,
  ].join(', ');
  return `(${renderAssistantBar.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
