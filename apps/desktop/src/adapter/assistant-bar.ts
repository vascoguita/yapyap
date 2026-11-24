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
  /** What the summary's box says while it is written (#705). */
  readonly summarizing: string;
  readonly closeSummary: string;
}

/** The summary of the unread messages, with its words in the user's language (#705). */
interface SummaryContent {
  readonly stage: 'working' | 'shown' | 'failed';
  /** The box's heading, which names it. */
  readonly title: string;
  /** What screen readers hear once it shows. */
  readonly ready: string;
  /** Its points, what needs the user first. */
  readonly points: readonly string[];
  /** That it covers only the newest messages, as the history limit allows; empty when it covers all. */
  readonly covers: string;
  /** Why no summary came; empty unless it failed. */
  readonly problem: string;
  /** Try Again's label, or empty when asking again will not help. */
  readonly retry: string;
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
  /** The summary of the unread messages, being written, shown or failed; null for none (#705). */
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
  /** The open chat's header, which the summary's box hangs below (#705). */
  readonly header: string;
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
    marginInline: string;
    translate: string;
    borderStartStartRadius: string;
    borderStartEndRadius: string;
    setProperty(name: string, value: string): void;
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
  readonly children: ArrayLike<BarNode>;
  contains(node: unknown): boolean;
  getBoundingClientRect(): {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  };
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
  /** The tray, which shows only with something in it: the summary's box alone has its own place (#764). */
  readonly tray: boolean;
  readonly bar: boolean;
}

/** The summary's box, at the top of the chat (#705). */
interface SummaryParts {
  readonly card: BarNode;
  readonly cardTitle: BarNode;
  readonly cardClose: BarNode;
  /** Tells screen readers once the summary shows. */
  readonly ready: BarNode;
  /** The sections, which scroll inside the box, or what it says while it is written or why none came. */
  readonly cardBody: BarNode;
  readonly covers: BarNode;
  readonly retry: BarNode;
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
  /** The suggestions' heading, beside the sparkle. */
  readonly heading: BarNode;
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
  /** WhatsApp's layer of the quote of the message the user replies to, while the tray moved it up (#764). */
  raised: BarNode | undefined;
  /** WhatsApp's message box, while the tray squared its top corners (#764). */
  squared: BarNode | undefined;
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
  readonly join: (
    scope: Scope,
    footer: BarNode,
    places: BarPlaces,
    store: Pick<BarStore, 'host' | 'parts' | 'raised' | 'squared'>,
    kit: BarKit,
  ) => void;
  readonly fitTray: (
    scope: Scope,
    footer: BarNode,
    store: Pick<BarStore, 'host' | 'parts'>,
    box: BarNode,
  ) => void;
  readonly square: (store: Pick<BarStore, 'squared'>, box: BarNode | null) => void;
  readonly squaredBy: (scope: Scope, box: BarNode) => boolean;
  readonly layer: (footer: BarNode, places: BarPlaces) => BarNode | undefined;
  readonly watchPage: (doc: BarDocument, scope: Scope, sync: () => void) => void;
  readonly box: (scope: Scope, footer: BarNode, places: BarPlaces) => BarNode | null;
  readonly raise: (store: Pick<BarStore, 'raised'>, layer: BarNode | undefined, by: number) => void;
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
  readonly summary: (doc: BarDocument, parts: BarParts, content: BarContent, kit: BarKit) => void;
  readonly sections: (doc: BarDocument, parts: BarParts, summary: SummaryContent) => void;
  readonly fit: (doc: BarDocument, places: BarPlaces, parts: BarParts, kit: BarKit) => void;
  readonly turn: (width: number, height: number) => string;
  readonly act: (
    doc: BarDocument,
    scope: Scope,
    places: BarPlaces,
    control: BarNode,
    kit: BarKit,
  ) => void;
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
  store.sync();
  kit.fit(doc, places, store.parts, kit);
  kit.align(scope, store.host, footer);
  kit.paint(scope, store.host, footer);
  kit.join(scope, footer, places, store, kit);
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
        kit.summary(doc, store.parts, shown, kit);
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
 * WhatsApp's message box: the field's nearest box with a fill of its own,
 * whose width, fill and corners the tray takes on (#764); null without one.
 */
export function assistantTrayBox(scope: Scope, footer: BarNode, places: BarPlaces): BarNode | null {
  const computed = scope['getComputedStyle'] as (node: BarNode) => {
    readonly backgroundColor: string;
  };
  // A box without a fill of its own reads as no colour, transparent, or one with no alpha.
  const clear = (node: BarNode): boolean =>
    /^(transparent|rgba\(.*,\s*0\))?$/.test(computed.call(scope, node).backgroundColor);
  const field = footer.ownerDocument.querySelector(places.field) as BarNode | null;
  let box = field?.parentElement ?? null;
  while (box !== null && box !== footer && clear(box)) {
    box = box.parentElement;
  }
  return box === footer ? null : box;
}

/**
 * Joins the tray of suggestions to WhatsApp's message box, which grows
 * upward to hold them, as it does for the quote of a message the user
 * replies to (#764): the tray takes the box's edges, fill and shadow, and
 * the box's top corners go square while the tray sits on it; the tray is
 * drawn over the box's own shadow there, so the two read as one box. While
 * the user replies, WhatsApp draws that quote right on top of the box; it
 * goes up by the tray's height, so the quote comes first, then the
 * suggestions, then the box. Measuring forces a layout, as every render
 * already does to put the bar in place.
 */
export function joinAssistantBar(
  scope: Scope,
  footer: BarNode,
  places: BarPlaces,
  store: Pick<BarStore, 'host' | 'parts' | 'raised' | 'squared'>,
  kit: BarKit,
): void {
  const { host, parts } = store;
  const box = kit.box(scope, footer, places);
  // Hidden, the bar's tray holds nothing either.
  const tray = parts.bar.dataset['tray'] === 'true';
  const layer = kit.layer(footer, places);
  // The user replies while WhatsApp squares the box's top under its quote; a quote it is
  // still taking away, as the user closed it, leaves the box rounded already.
  const replying = box !== null && layer !== undefined && kit.squaredBy(scope, box);
  parts.bar.dataset['joined'] = replying ? 'quote' : 'box';
  if (box !== null) {
    kit.fitTray(scope, footer, store, box);
  }
  kit.square(store, tray && !replying ? box : null);
  // By its exact height, which a scaled display makes fractional, less the pixel the tray
  // overlaps it by, so no hairline of wallpaper shows between the two.
  kit.raise(store, layer, tray ? host.getBoundingClientRect().height - 1 : 0);
}

/**
 * Whether WhatsApp itself squared the message box's top corners, as it
 * does under its quote of a message the user replies to (#764). The
 * tray's own squaring is set aside for a moment to tell.
 */
export function assistantBoxSquared(scope: Scope, box: BarNode): boolean {
  const { style } = box;
  const kept = [style.borderStartStartRadius, style.borderStartEndRadius] as const;
  style.borderStartStartRadius = '';
  style.borderStartEndRadius = '';
  // WhatsApp squares both top corners together, so one tells, whichever way the text runs.
  const computed = scope['getComputedStyle'] as (node: BarNode) => {
    readonly borderTopLeftRadius: string;
  };
  const radius = computed.call(scope, box).borderTopLeftRadius;
  [style.borderStartStartRadius, style.borderStartEndRadius] = kept;
  return Number.parseFloat(radius) === 0;
}

/**
 * Gives the tray the message box's exact edges, fill and shadow, and draws
 * it just over the box, whose shadow it hides where they meet (#764).
 */
export function fitAssistantTray(
  scope: Scope,
  footer: BarNode,
  { host, parts }: Pick<BarStore, 'host' | 'parts'>,
  box: BarNode,
): void {
  const style = (node: BarNode) =>
    (
      scope['getComputedStyle'] as (node: BarNode) => {
        readonly backgroundColor: string;
        readonly boxShadow: string;
        readonly direction: string;
        readonly zIndex: string;
      }
    ).call(scope, node);
  const [inner, outer] = [box.getBoundingClientRect(), host.getBoundingClientRect()];
  const [left, right] = [inner.left - outer.left, outer.right - inner.right];
  const ltr = style(footer).direction !== 'rtl';
  parts.bar.style.marginInline = `${String(ltr ? left : right)}px ${String(ltr ? right : left)}px`;
  const { backgroundColor, boxShadow } = style(box);
  host.style.setProperty('--tray', backgroundColor);
  host.style.setProperty('--tray-shadow', boxShadow);
  host.style.zIndex = String((Number.parseInt(style(footer).zIndex, 10) || 0) + 1);
}

/**
 * Squares the top corners of the message box the tray sits on, and puts
 * back those of one it squared before that it no longer sits on (#764).
 */
export function squareAssistantBox(store: Pick<BarStore, 'squared'>, box: BarNode | null): void {
  if (store.squared !== undefined && store.squared !== box) {
    store.squared.style.borderStartStartRadius = '';
    store.squared.style.borderStartEndRadius = '';
  }
  if (box !== null) {
    box.style.borderStartStartRadius = '0';
    box.style.borderStartEndRadius = '0';
  }
  store.squared = box ?? undefined;
}

/**
 * Moves WhatsApp's layer of the quote up `by` pixels, over the tray, and
 * puts back one it moved before that is no longer the quote's (#764).
 */
export function raiseAssistantQuote(
  store: Pick<BarStore, 'raised'>,
  layer: BarNode | undefined,
  by: number,
): void {
  if (store.raised !== undefined && store.raised !== layer) {
    store.raised.style.translate = '';
  }
  if (layer !== undefined) {
    layer.style.translate = by > 0 ? `0 ${String(-by)}px` : '';
  }
  store.raised = by > 0 ? layer : undefined;
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
    raised: undefined,
    squared: undefined,
    sync: () => {
      kit.show(doc, scope, places, store, kit);
      const footer = doc.querySelector(places.footer) as BarNode | null;
      if (footer !== null) {
        kit.join(scope, footer, places, store, kit);
      }
    },
  };
  kit.watchPage(doc, scope, store.sync);
  return store;
}

/**
 * Looks again as the user types, and right after a click, which may start
 * or close a reply that WhatsApp shows at once and then animates (#764),
 * rather than at the next render, up to a second later.
 */
export function listenToAssistantPage(doc: BarDocument, scope: Scope, sync: () => void): void {
  doc.addEventListener('input', sync, true);
  // WhatsApp's editor deletes without an `input` event, so a key let go looks again.
  doc.addEventListener('keyup', sync, true);
  const later = scope['setTimeout'] as (callback: () => void, ms: number) => unknown;
  doc.addEventListener(
    'click',
    () => {
      later.call(scope, sync, 50);
      later.call(scope, sync, 400);
    },
    true,
  );
}

/** WhatsApp's layer in the footer that holds the quote of the message the user replies to; none without one. */
export function assistantQuoteLayer(footer: BarNode, places: BarPlaces): BarNode | undefined {
  const quote = footer.ownerDocument.querySelector(places.quote);
  return quote === null
    ? undefined
    : Array.from(footer.children).find((child) => child.contains(quote));
}

/**
 * The bar's rows, each starting with the sparkle: the notice, with its
 * text, its button and close; the suggestions, under their heading, which
 * ends with the button that folds them away, with what tells screen
 * readers they are being written; and the one button they fold into, which
 * shows them again (#729, #764).
 */
export function assistantBarRows(
  doc: BarDocument,
  bar: BarNode,
  places: BarPlaces,
  kit: BarKit,
): Omit<BarParts, keyof SummaryParts> {
  const make = (tag: string, name: string, parent: BarNode, action?: string): BarNode =>
    kit.node(doc, tag, name, parent, action);
  const icon = (name: keyof BarPlaces['icons'], role: string): BarNode =>
    kit.icon(doc, places.icons[name], role);
  const notice = make('div', 'row notice', bar);
  notice.setAttribute('role', 'status');
  notice.append(icon('sparkle', 'mark'));
  const chips = make('div', 'chips', bar);
  const head = make('div', 'row head', chips);
  head.append(icon('sparkle', 'mark'));
  const folded = make('div', 'row folded', bar);
  const parts = {
    bar,
    notice,
    text: make('span', 'text', notice),
    action: make('button', 'action', notice, 'button'),
    close: make('button', 'icon', notice, 'button'),
    chips,
    heading: make('span', 'heading', head),
    collapse: make('button', 'icon', head, 'collapse'),
    list: make('ul', 'list', chips),
    status: make('span', 'status', chips),
    folded,
    expand: make('button', 'fold', folded, 'expand'),
    foldLabel: doc.createElement('span'),
  };
  parts.status.setAttribute('role', 'status');
  parts.foldLabel.setAttribute('class', 'fold-label');
  parts.close.dataset['id'] = 'close';
  parts.close.append(icon('close', 'cross'));
  parts.collapse.append(icon('fold', 'chevron'));
  parts.expand.append(icon('sparkle', 'mark'), parts.foldLabel, icon('unfold', 'chevron'));
  return parts;
}

/**
 * The summary's box (#705): a region named by its heading, which starts
 * with the sparkle and ends with a cross to close it; the sections, which
 * scroll inside it; and its foot, which says how much it covers, or offers
 * Try Again. It opens on its own, so it never takes the focus from the
 * message box; screen readers hear once that it is ready.
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
  card.dataset['card'] = 'true';
  const head = kit.node(doc, 'div', 'card-head', card);
  head.append(kit.icon(doc, places.icons.sparkle, 'mark'));
  const cardTitle = kit.node(doc, 'h2', 'card-title', head);
  cardTitle.setAttribute('id', 'summary-title');
  const ready = kit.node(doc, 'span', 'status', head);
  ready.setAttribute('role', 'status');
  const cardClose = kit.node(doc, 'button', 'icon', head, 'closeSummary');
  cardClose.append(kit.icon(doc, places.icons.close, 'cross'));
  const cardBody = kit.node(doc, 'div', 'card-body', card);
  const foot = kit.node(doc, 'div', 'card-foot', card);
  const covers = kit.node(doc, 'p', 'covers', foot);
  const retry = kit.node(doc, 'button', 'action', foot, 'summarize');
  return { card, cardTitle, cardClose, ready, cardBody, covers, retry };
}

/**
 * Which of the bar's rows hide: the suggestions while they are folded
 * away, or while there are none and none are being written; the button
 * they fold into unless they are folded and there are some to show again;
 * and the summary's box while there is none (#705), which has its own
 * place at the top of the chat. Neither row hides while the user types
 * (#743).
 */
export function assistantBarHidden(parts: BarParts): BarHidden {
  const { items = '0', writing } = parts.list.dataset;
  const collapsed = parts.bar.dataset['collapsed'] === 'true';
  const card = (parts.bar.dataset['summary'] ?? 'none') === 'none';
  const nothing = items === '0' && writing !== 'true';
  const chips = collapsed || nothing;
  const folded = !collapsed || items === '0';
  const tray = [chips, folded, parts.notice.hidden].every(Boolean);
  return { chips, folded, card, tray, bar: tray && card };
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
  const tray = String(!hidden.tray);
  if (
    !same ||
    `${host.style.display}/${String(parts.bar.dataset['tray'])}` !== `${display}/${tray}`
  ) {
    kit.room(scope, places, parts.bar, () => {
      parts.chips.hidden = hidden.chips;
      parts.folded.hidden = hidden.folded;
      parts.card.hidden = hidden.card;
      parts.bar.dataset['tray'] = tray;
      host.style.display = display;
    });
  }
}

/**
 * Acts on the user's clicks and keys, never on ones a page script made up,
 * and keeps keys pressed on the bar from reaching WhatsApp's own
 * shortcuts. Escape in the summary's box closes it (#705).
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
 * Does what the user clicked: closing the summary also gives the message
 * box the focus back; anything else goes to the main process. A
 * suggestion is named by its index, the notice's button by its ID;
 * folding takes nothing.
 */
export function actOnAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  control: BarNode,
  kit: BarKit,
): void {
  const { action, index, id } = control.dataset;
  if (action === 'closeSummary') {
    kit.close(doc, scope, places);
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
 * Closes the summary, and gives the message box the focus back, which a
 * click on the box's cross had taken (#705).
 */
export function closeAssistantSummary(doc: BarDocument, scope: Scope, places: BarPlaces): void {
  ((scope[places.bridge] ?? {}) as Actions)['closeSummary']?.();
  (doc.querySelector(places.field) as BarNode | null)?.focus();
}

/**
 * Hangs the summary's box just below the open chat's header, at its
 * inline end, at most half as high as the space down to the bar (and
 * 420px), so the chat shows around it; the box scrolls inside (#705). It
 * is drawn over the chat, which keeps its height. The box is the bar's,
 * so it is placed from the bar's own top. Measuring forces a layout, so it
 * measures only while the box shows; it also times the working light to
 * the box's size.
 */
export function fitAssistantSummary(
  doc: BarDocument,
  places: BarPlaces,
  parts: BarParts,
  kit: Pick<BarKit, 'turn'>,
): void {
  const header = doc.querySelector(places.header) as BarNode | null;
  if (parts.card.hidden || header === null) {
    return;
  }
  const below = header.getBoundingClientRect().bottom + 12;
  const top = parts.bar.getBoundingClientRect().top;
  parts.card.style.insetBlockStart = `${String(Math.round(below - top))}px`;
  const room = Math.min(420, Math.max(96, (top - below) / 2));
  parts.card.style.maxBlockSize = `${String(Math.round(room))}px`;
  const box = parts.card.getBoundingClientRect();
  parts.card.style.setProperty('--edge-turn', kit.turn(box.width, box.height));
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
  parts.heading.textContent = labels.suggestions;
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
  const writing = content.writing && content.suggestions.length === 0;
  parts.bar.dataset['collapsed'] = String(content.collapsed);
  parts.collapse.setAttribute('aria-expanded', 'true');
  parts.expand.setAttribute('aria-expanded', 'false');
  parts.list.dataset['items'] = String(content.suggestions.length);
  parts.list.dataset['writing'] = String(writing);
  parts.list.setAttribute('aria-busy', String(writing));
  parts.status.textContent = writing ? content.labels.writing : '';
}

/**
 * Shows the summary's box (#705): while it is written, its heading and a
 * line that says so, with the light round its edge; then its sections; or
 * why none came, with Try Again when asking again may help. Screen readers
 * hear once that it is ready.
 */
export function summaryAssistantBar(
  doc: BarDocument,
  parts: BarParts,
  content: BarContent,
  kit: BarKit,
): void {
  const { summary, labels } = content;
  parts.bar.dataset['summary'] = summary?.stage ?? 'none';
  if (summary === null) {
    parts.ready.textContent = '';
    return;
  }
  parts.card.setAttribute('class', summary.stage === 'working' ? 'card working' : 'card');
  parts.card.setAttribute('aria-busy', String(summary.stage === 'working'));
  parts.cardTitle.textContent = summary.title;
  parts.cardClose.setAttribute('aria-label', labels.closeSummary);
  parts.cardClose.setAttribute('title', labels.closeSummary);
  parts.ready.textContent = summary.stage === 'shown' ? summary.ready : '';
  if (summary.stage === 'shown') {
    kit.sections(doc, parts, summary);
    return;
  }
  const line = doc.createElement('p');
  line.setAttribute('class', 'card-line');
  line.textContent = summary.stage === 'working' ? labels.summarizing : summary.problem;
  parts.cardBody.replaceChildren(line);
  parts.covers.hidden = true;
  parts.retry.hidden = summary.retry === '';
  parts.retry.textContent = summary.retry;
}

/** Fills the summary's box: its points as one list, as text, never markup, and its foot. */
export function assistantSummarySections(
  doc: BarDocument,
  parts: BarParts,
  summary: SummaryContent,
): void {
  const list = doc.createElement('ul');
  for (const text of summary.points) {
    const item = doc.createElement('li');
    item.textContent = text;
    list.append(item);
  }
  parts.cardBody.replaceChildren(list);
  parts.cardBody.scrollTop = 0;
  parts.covers.textContent = summary.covers;
  parts.covers.hidden = summary.covers === '';
  parts.retry.hidden = true;
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
:host {
  display: block;
  --tray: var(--chip);
  --tray-chip: color-mix(in srgb, var(--text) 6%, var(--tray));
  --tray-chip-hover: color-mix(in srgb, var(--text) 11%, var(--tray));
  --tray-line: color-mix(in srgb, var(--text) 10%, var(--tray));
}
[hidden] { display: none !important; }
.bar {
  position: relative; display: flex; flex-direction: column; gap: var(--space-1); box-sizing: border-box;
  padding-block: 6px var(--space-2); padding-inline: var(--space-4); background: transparent;
  color: var(--text); font-family: inherit; font-size: var(--font-body);
}
.bar[data-tray='true'] {
  isolation: isolate; padding-block: var(--space-2) 10px; padding-inline: var(--space-4) var(--space-2);
}
.bar[data-tray='true']::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  border-start-start-radius: 26px; border-start-end-radius: 26px; background: var(--tray);
  box-shadow: var(--tray-shadow, none); clip-path: inset(-16px -16px 0 -16px);
}
.bar[data-tray='true'][data-joined='quote']::before { border-radius: 0; clip-path: inset(0 -16px); }
.bar[data-tray='true']::after {
  content: ''; position: absolute; inset-inline: var(--space-4); inset-block-end: 0;
  block-size: 1px; background: var(--tray-line);
}
.row { display: flex; align-items: center; gap: var(--space-2); min-inline-size: 0; }
svg {
  flex: none; inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}
.mark { color: var(--ai); }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
.notice { min-block-size: 36px; }
.text { flex: 1; min-inline-size: 0; padding-block: 6px; overflow-wrap: anywhere; }
.action {
  flex: none; min-block-size: 32px; padding-inline: var(--space-3);
  border: 0; border-radius: var(--radius-pill); background: var(--tray-chip); color: var(--ai); font-weight: 600;
}
.action:hover { background: var(--tray-chip-hover); }
.icon {
  display: grid; flex: none; place-items: center; inline-size: 32px; block-size: 32px;
  padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted);
}
.icon:hover { background: var(--hover); }
.chips { display: flex; flex-direction: column; gap: var(--space-1); }
.head { min-block-size: 32px; }
.head .mark, .folded .mark { inline-size: 16px; block-size: 16px; }
.heading { flex: 1; min-inline-size: 0; color: var(--muted); font-size: var(--font-hint); }
.list {
  display: flex; flex-wrap: wrap; gap: var(--space-2); min-inline-size: 0; margin: 0;
  padding: var(--space-1) var(--space-2) 0 0; list-style: none;
}
li { display: flex; min-inline-size: 0; max-inline-size: 100%; }
.chip {
  display: -webkit-box; min-block-size: 36px; max-inline-size: 100%; padding-block: 7px;
  padding-inline: 14px; overflow: hidden; border: 0; border-radius: 18px;
  background: var(--tray-chip); color: var(--text); font-size: var(--font-body); line-height: 1.3;
  text-align: start; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
  overflow-wrap: anywhere;
}
.chip:hover { background: var(--tray-chip-hover); }
.placeholder {
  --edge: var(--ai); --edge-track: var(--tray-line); --edge-fill: var(--tray-chip);
  --edge-turn: ${edgeTurn(184, 36)};
  flex: none; align-items: center; box-sizing: border-box; inline-size: 184px; block-size: 36px;
  padding-inline: 14px; overflow: hidden; border: 0; border-radius: var(--radius-pill);
  background: var(--tray-chip); color: var(--muted); white-space: nowrap;
  text-overflow: ellipsis;
}
.status {
  position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%);
  white-space: nowrap;
}
.fold {
  display: flex; flex: 1; align-items: center; gap: var(--space-2); min-block-size: 32px;
  padding: 0; border: 0; background: transparent; color: var(--muted);
  font-size: var(--font-hint); text-align: start;
}
.fold .chevron { inline-size: 18px; block-size: 18px; }
.fold-label { flex: 1; }
.bar[data-typed='true'] .chips { opacity: 0.7; }
.bar[data-typed='true'] .chips:hover, .bar[data-typed='true'] .chips:focus-within { opacity: 1; }
.card {
  position: absolute; inset-inline-end: var(--space-4); inline-size: min(360px, calc(100% - 2 * var(--space-4)));
  display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
  border: 1px solid var(--ai-border); border-radius: 16px; background: var(--ai-tint);
  box-shadow: 0 4px 16px var(--shadow);
  --edge: var(--ai); --edge-track: var(--ai-border); --edge-fill: var(--ai-tint);
}
.card:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
.card-head {
  display: flex; flex: none; align-items: center; gap: var(--space-2);
  padding-block: var(--space-1); padding-inline: var(--space-3) var(--space-1);
}
.card-title { flex: 1; min-inline-size: 0; margin: 0; font-size: var(--font-body); font-weight: 600; }
.card-body {
  flex: 1 1 auto; min-block-size: 0; overflow-y: auto; padding-inline: var(--space-3); padding-block-end: var(--space-2);
  scrollbar-width: thin; scrollbar-color: var(--ai-border) transparent;
}
.card-body ul { margin: 0; padding-inline-start: var(--space-4); }
.card-body li { display: list-item; margin-block-end: var(--space-1); overflow-wrap: anywhere; line-height: 1.35; }
.card-line { margin: 0; color: var(--muted); line-height: 1.35; overflow-wrap: anywhere; }
.card-foot {
  display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--space-2); padding-block: 0 var(--space-2); padding-inline: var(--space-3);
}
.card-foot:not(:has(> :not([hidden]))) { display: none; }
.covers { flex: 1 1 12em; margin: 0; color: var(--muted); font-size: var(--font-hint); }
.card-foot .action { margin-inline-start: auto; }
`;

const PLACES: BarPlaces = {
  footer: LANDMARKS.composerFooter,
  field: LANDMARKS.composer,
  quote: LANDMARKS.composerQuote,
  conversation: LANDMARKS.conversation,
  header: LANDMARKS.conversationHeader,
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
    `join: ${joinAssistantBar.toString()}`,
    `box: ${assistantTrayBox.toString()}`,
    `raise: ${raiseAssistantQuote.toString()}`,
    `fitTray: ${fitAssistantTray.toString()}`,
    `square: ${squareAssistantBox.toString()}`,
    `squaredBy: ${assistantBoxSquared.toString()}`,
    `layer: ${assistantQuoteLayer.toString()}`,
    `watchPage: ${listenToAssistantPage.toString()}`,
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
    `turn: ${edgeTurn.toString()}`,
    `close: ${closeAssistantSummary.toString()}`,
  ].join(', ');
  return `(${renderAssistantBar.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
