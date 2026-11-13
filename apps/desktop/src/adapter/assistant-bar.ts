import { ASSISTANT_BAR_BRIDGE } from '../shared/api/assistant-bar-api.ts';
import { ASSISTANT_ICONS, ASSISTANT_THEME } from './assistant-look.ts';
import { LANDMARKS } from './page-state.ts';

/** YapYap's own words on the bar, in the user's language. */
interface BarLabels {
  readonly label: string;
  readonly suggestions: string;
  readonly use: string;
  readonly dismiss: string;
  readonly close: string;
}

/** Everything the bar shows, as plain JSON: YapYap's labels and the assistant's text. */
export interface BarContent {
  readonly visible: boolean;
  readonly labels: BarLabels;
  readonly suggestions: readonly string[];
  /** What a rewrite did, or what keeps the assistant from answering, with its one button. */
  readonly notice: {
    readonly text: string;
    readonly button: { readonly id: string; readonly label: string } | null;
  } | null;
}

/** Where the bar goes and what it keeps, fixed for every render. */
interface BarPlaces {
  /** The open chat's message box row, which the bar sits right above, and the box itself. */
  readonly footer: string;
  readonly field: string;
  /** The open chat and a message in it, to find the list the bar takes room from. */
  readonly conversation: string;
  readonly message: string;
  /** The adapter world's global that holds the bar between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the bar's actions. */
  readonly bridge: string;
  readonly style: string;
  readonly icons: { readonly sparkle: string; readonly close: string };
}

/** The few DOM features the bar uses; the main process compiles this without DOM types. */
interface BarNode {
  textContent: string | null;
  hidden: boolean;
  scrollTop: number;
  readonly offsetHeight: number;
  readonly parentElement: BarNode | null;
  readonly ownerDocument: BarDocument;
  readonly previousElementSibling: unknown;
  readonly style: { order: string; position: string; zIndex: string; display: string };
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  append(...nodes: BarNode[]): void;
  replaceChildren(...nodes: BarNode[]): void;
  addEventListener(type: string, listener: (event: BarEvent) => void): void;
  closest(selectors: string): BarNode | null;
  before(node: BarNode): void;
  remove(): void;
  attachShadow(init: { readonly mode: 'closed' }): BarNode;
}

interface BarEvent {
  readonly isTrusted: boolean;
  readonly target: unknown;
  stopPropagation(): void;
}

interface BarDocument {
  querySelector(selectors: string): unknown;
  createElement(tag: string): BarNode;
  createElementNS(namespace: string, tag: string): BarNode;
  addEventListener(type: string, listener: () => void, capture: boolean): void;
}

/** The parts of the bar that change with its content. */
interface BarParts {
  readonly bar: BarNode;
  readonly notice: BarNode;
  readonly text: BarNode;
  readonly action: BarNode;
  readonly close: BarNode;
  readonly chips: BarNode;
  readonly list: BarNode;
  readonly dismiss: BarNode;
}

/** The bar between renders: its host in WhatsApp's page, and what it last showed. */
interface BarStore {
  readonly host: BarNode;
  readonly parts: BarParts;
  key: string | null;
  /** Shows the suggestions only while the message box is empty, and the bar only with something in it. */
  readonly sync: () => void;
}

type Scope = Record<string, unknown>;

/** The bar's helpers, passed in because each runs as its own source text. */
export interface BarKit {
  readonly align: (scope: Scope, host: BarNode, footer: BarNode) => void;
  readonly room: (scope: Scope, places: BarPlaces, bar: BarNode, change: () => void) => void;
  readonly build: (doc: BarDocument, scope: Scope, places: BarPlaces, kit: BarKit) => BarStore;
  readonly rows: (doc: BarDocument, bar: BarNode, places: BarPlaces, kit: BarKit) => BarParts;
  readonly node: (
    doc: BarDocument,
    tag: string,
    name: string,
    parent: BarNode,
    action?: string,
  ) => BarNode;
  readonly show: (
    doc: BarDocument,
    scope: Scope,
    places: BarPlaces,
    store: Pick<BarStore, 'host' | 'parts'>,
    kit: BarKit,
  ) => void;
  readonly wire: (shadow: BarNode, scope: Scope, places: BarPlaces) => void;
  readonly update: (doc: BarDocument, parts: BarParts, content: BarContent) => void;
  readonly notice: (parts: BarParts, notice: BarContent['notice']) => void;
  readonly icon: (doc: BarDocument, path: string, name: string) => BarNode;
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
  const key = JSON.stringify(content);
  if (placed) {
    footer.before(store.host);
  }
  if (store.key !== key) {
    store.key = key;
    kit.room(scope, places, store.parts.bar, () => {
      kit.update(doc, store.parts, content);
      kit.notice(store.parts, content.notice);
    });
  }
  store.sync();
  kit.align(scope, store.host, footer);
  return placed ? 'placed' : 'kept';
}

/**
 * Puts the bar where the message box is in WhatsApp's layout. WhatsApp
 * orders the open chat's parts with flexbox `order` and lays a positioned
 * wallpaper over the chat, so the bar takes the message box's order and
 * stacking, read anew on every render in case WhatsApp changes them (#466).
 * It follows WhatsApp's own theme, which can differ from the system's:
 * light text in the message box means its dark theme.
 */
export function alignAssistantBar(scope: Scope, host: BarNode, footer: BarNode): void {
  const computed = scope['getComputedStyle'] as (node: BarNode) => {
    readonly order: string;
    readonly zIndex: string;
    readonly color: string;
  };
  const { order, zIndex, color } = computed.call(scope, footer);
  host.style.order = order;
  host.style.position = 'relative';
  host.style.zIndex = zIndex;
  const [red = 0, green = 0, blue = 0] = (color.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  host.dataset['theme'] = 0.299 * red + 0.587 * green + 0.114 * blue > 128 ? 'dark' : 'light';
}

/**
 * Makes `change` to the bar and keeps the chat's newest messages in view.
 * The bar takes its room from the message list, which keeps its scroll
 * position as it gets shorter, so the bar would cover the last message and
 * the user would have to scroll down to it (#607). The list scrolls by as
 * much as the bar grew, or back by as much as it shrank. The list is the
 * nearest scrolling box around a message, inside the open chat. Measuring
 * forces a layout, so it measures only around a change.
 */
export function holdAssistantBarRoom(
  scope: Scope,
  places: BarPlaces,
  bar: BarNode,
  change: () => void,
): void {
  const before = bar.offsetHeight;
  change();
  const grown = bar.offsetHeight - before;
  const computed = scope['getComputedStyle'] as (node: BarNode) => { readonly overflowY: string };
  let node =
    grown === 0 ? null : (bar.ownerDocument.querySelector(places.message) as BarNode | null);
  while (node !== null && node.closest(places.conversation) !== null) {
    if (['auto', 'scroll'].includes(computed.call(scope, node).overflowY)) {
      node.scrollTop += grown;
      return;
    }
    node = node.parentElement;
  }
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
  const parts = kit.rows(doc, bar, places, kit);
  const { notice, chips } = parts;
  // Nothing shows until the first render says what to, so the room it takes is measured from none.
  notice.hidden = true;
  chips.hidden = true;
  host.style.display = 'none';
  kit.wire(shadow, scope, places);
  const store: BarStore = {
    host,
    parts,
    key: null,
    sync: () => {
      kit.show(doc, scope, places, store, kit);
    },
  };
  doc.addEventListener('input', store.sync, true);
  return store;
}

/**
 * The bar's two rows, each starting with the sparkle: the notice, with its
 * text, its button and close, and the suggestions, with dismiss.
 */
export function assistantBarRows(
  doc: BarDocument,
  bar: BarNode,
  places: BarPlaces,
  kit: BarKit,
): BarParts {
  const make = (tag: string, name: string, parent: BarNode, action?: string): BarNode =>
    kit.node(doc, tag, name, parent, action);
  const notice = make('div', 'row notice', bar);
  notice.setAttribute('role', 'status');
  notice.append(kit.icon(doc, places.icons.sparkle, 'mark'));
  const chips = make('div', 'row chips', bar);
  chips.append(kit.icon(doc, places.icons.sparkle, 'mark'));
  const parts: BarParts = {
    bar,
    notice,
    text: make('span', 'text', notice),
    action: make('button', 'action', notice, 'button'),
    close: make('button', 'icon', notice, 'button'),
    chips,
    list: make('ul', 'list', chips),
    dismiss: make('button', 'icon', chips, 'dismiss'),
  };
  parts.close.dataset['id'] = 'close';
  parts.close.append(kit.icon(doc, places.icons.close, 'cross'));
  parts.dismiss.append(kit.icon(doc, places.icons.close, 'cross'));
  return parts;
}

/** One part of the bar, with the class its styles use; a button names its action. */
export function assistantBarNode(
  doc: BarDocument,
  tag: string,
  name: string,
  parent: BarNode,
  action?: string,
): BarNode {
  const node = doc.createElement(tag);
  node.setAttribute('class', name);
  if (action !== undefined) {
    node.dataset['action'] = action;
    node.setAttribute('type', 'button');
  }
  parent.append(node);
  return node;
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
  const typed = (field?.textContent ?? '').trim() !== '';
  const noChips = typed || parts.list.textContent === '';
  const display = noChips && parts.notice.hidden ? 'none' : '';
  if (parts.chips.hidden !== noChips || host.style.display !== display) {
    kit.room(scope, places, parts.bar, () => {
      parts.chips.hidden = noChips;
      host.style.display = display;
    });
  }
}

/** The bridge's actions, as the adapter world has them once the preload ran. */
type Actions = Record<string, ((value?: unknown) => void) | undefined>;

/**
 * Acts on the user's clicks, never on clicks a page script made up, and
 * keeps keys pressed on the bar from reaching WhatsApp's own shortcuts.
 */
export function wireAssistantBar(shadow: BarNode, scope: Scope, places: BarPlaces): void {
  const bridge = (): Actions => (scope[places.bridge] ?? {}) as Actions;
  shadow.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });
  shadow.addEventListener('click', (event) => {
    const control = event.isTrusted ? (event.target as BarNode).closest('[data-action]') : null;
    if (control === null) {
      return;
    }
    const { action, index, id } = control.dataset;
    // A suggestion is named by its index, the notice's button by its ID; dismissing takes nothing.
    const act = bridge()[String(action)];
    if (index !== undefined) {
      act?.(Number(index));
    } else if (id === undefined) {
      act?.();
    } else {
      act?.(id);
    }
  });
}

/** Shows new content, writing the assistant's text only as text, never as markup. */
export function updateAssistantBar(doc: BarDocument, parts: BarParts, content: BarContent): void {
  const { labels } = content;
  const label = 'aria-label';
  parts.bar.setAttribute(label, labels.label);
  parts.chips.setAttribute(label, labels.suggestions);
  parts.dismiss.setAttribute(label, labels.dismiss);
  parts.dismiss.setAttribute('title', labels.dismiss);
  parts.close.setAttribute(label, labels.close);
  parts.close.setAttribute('title', labels.close);
  parts.list.replaceChildren(
    ...content.suggestions.map((text, index) => {
      const item = doc.createElement('li');
      const chip = doc.createElement('button');
      chip.setAttribute('class', 'chip');
      chip.setAttribute('type', 'button');
      chip.setAttribute('title', `${text}\n${labels.use}`);
      chip.dataset['action'] = 'use';
      chip.dataset['index'] = String(index);
      chip.textContent = text;
      item.append(chip);
      return item;
    }),
  );
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

/** A stroke icon on a 24 px grid, hidden from screen readers: the controls are labelled. */
export function assistantBarIcon(doc: BarDocument, path: string, name: string): BarNode {
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svgNs, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('class', name);
  const shape = doc.createElementNS(svgNs, 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
}

/**
 * The bar's own styles, inside its shadow root: one slim row at a time,
 * the sparkle in the assistant's own accent (`ASSISTANT_THEME`), then the
 * notice's text and button, or the suggestions as chips that scroll
 * sideways rather than wrap, so the bar stays one row at any width. Logical
 * properties only, so it mirrors for right-to-left languages (ADR 0012).
 */
const BAR_STYLE = `${ASSISTANT_THEME}
:host { display: block; }
[hidden] { display: none !important; }
.bar {
  display: flex; flex-direction: column; box-sizing: border-box; padding-block: 6px;
  padding-inline: 16px 8px; border-block-start: 1px solid var(--area-border);
  background: var(--area); color: var(--text); font-family: inherit; font-size: 14px;
}
.row { display: flex; align-items: center; gap: 10px; min-block-size: 44px; min-inline-size: 0; }
svg {
  flex: none; inline-size: 22px; block-size: 22px; fill: none; stroke: currentColor;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}
.mark { color: var(--ai); }
.text { flex: 1; min-inline-size: 0; padding-block: 4px; overflow-wrap: anywhere; }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
.action {
  flex: none; min-block-size: 40px; padding-inline: 16px; border: 1px solid var(--ai-border);
  border-radius: 20px; background: var(--chip); color: var(--ai); font-weight: 600;
}
.action:hover { background: var(--ai-tint); }
.icon {
  display: grid; flex: none; place-items: center; inline-size: 44px; block-size: 44px;
  margin-inline-start: auto; padding: 0; border: 0; border-radius: 50%; background: transparent;
  color: var(--muted);
}
.icon:hover { background: var(--hover); }
.list {
  display: flex; flex: 1; gap: 8px; min-inline-size: 0; margin: 0; padding-block: 2px;
  padding-inline: 0; overflow-x: auto; list-style: none; scrollbar-width: thin;
}
li { display: flex; flex: none; max-inline-size: 75%; }
.chip {
  min-block-size: 40px; max-inline-size: 100%; padding-inline: 16px; overflow: hidden;
  border: 1px solid var(--chip-border); border-radius: 20px; background: var(--chip);
  color: var(--text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap;
}
.chip:hover { border-color: var(--ai-border); background: var(--ai-tint); }
`;

const PLACES: BarPlaces = {
  footer: LANDMARKS.composerFooter,
  field: LANDMARKS.composer,
  conversation: LANDMARKS.conversation,
  message: LANDMARKS.message,
  store: 'yapyapAssistantBarView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: BAR_STYLE,
  icons: { sparkle: ASSISTANT_ICONS.sparkle, close: ASSISTANT_ICONS.close },
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function assistantBarRender(content: BarContent): string {
  const kit = [
    `align: ${alignAssistantBar.toString()}`,
    `room: ${holdAssistantBarRoom.toString()}`,
    `build: ${buildAssistantBar.toString()}`,
    `rows: ${assistantBarRows.toString()}`,
    `node: ${assistantBarNode.toString()}`,
    `show: ${showAssistantBar.toString()}`,
    `wire: ${wireAssistantBar.toString()}`,
    `update: ${updateAssistantBar.toString()}`,
    `notice: ${noticeAssistantBar.toString()}`,
    `icon: ${assistantBarIcon.toString()}`,
  ].join(', ');
  return `(${renderAssistantBar.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
