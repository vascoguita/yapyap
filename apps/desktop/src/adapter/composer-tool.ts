import { ASSISTANT_BAR_BRIDGE } from '../shared/api/assistant-bar-api.ts';
import { ASSISTANT_ICONS, ASSISTANT_THEME } from './assistant-look.ts';
import { LANDMARKS } from './page-state.ts';

/** One way the button rewrites the draft, in the user's words. */
interface ToolOption {
  readonly value: string;
  readonly label: string;
  /** What it does, shown under its name in the menu. */
  readonly hint: string;
}

/** Everything the rewrite button in the message box shows, as plain JSON (#609). */
export interface ToolContent {
  readonly visible: boolean;
  /** The assistant rewrites the draft; the button waits, and its sparkle pulses. */
  readonly working: boolean;
  /** The way a click on the button rewrites, one of `options`. */
  readonly current: string;
  readonly options: readonly ToolOption[];
  readonly labels: {
    readonly label: string;
    readonly more: string;
    readonly settings: string;
    /** The model in use, as the settings item's second line. */
    readonly model: string;
  };
}

/** Where the button goes and what it keeps, fixed for every render. */
interface ToolPlaces {
  /** WhatsApp's message box, whose row the button joins, and the row around it all. */
  readonly field: string;
  readonly footer: string;
  /** The open chat's header, which the menu stays below. */
  readonly header: string;
  /** The adapter world's global that holds the button between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the assistant's actions. */
  readonly bridge: string;
  readonly style: string;
  /** The icons' SVG paths, which the source text cannot reach as module constants. */
  readonly icons: {
    /** Each way's own icon, by its value; the sparkle stands for a way without one. */
    readonly modes: Readonly<Record<string, string>>;
    readonly sparkle: string;
    readonly caret: string;
    readonly check: string;
    readonly settings: string;
  };
}

/** The few DOM features the button uses; the main process compiles this without DOM types. */
interface ToolNode {
  textContent: string | null;
  hidden: boolean;
  disabled: boolean;
  readonly parentElement: ToolNode | null;
  readonly lastElementChild: ToolNode | null;
  readonly previousElementSibling: unknown;
  readonly style: { setProperty(name: string, value: string): void; display: string };
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  append(...nodes: ToolNode[]): void;
  replaceChildren(...nodes: ToolNode[]): void;
  addEventListener(type: string, listener: (event: ToolEvent) => void): void;
  querySelector(selectors: string): ToolNode | null;
  querySelectorAll(selectors: string): ArrayLike<ToolNode>;
  closest(selectors: string): ToolNode | null;
  contains(node: unknown): boolean;
  before(node: ToolNode): void;
  remove(): void;
  focus(): void;
  attachShadow(init: { readonly mode: 'closed' }): ToolNode;
  readonly activeElement?: unknown;
  readonly scrollHeight: number;
  readonly ownerDocument: ToolDocument;
  getBoundingClientRect(): { readonly top: number; readonly bottom: number };
}

interface ToolEvent {
  readonly isTrusted: boolean;
  readonly key?: string;
  readonly target: unknown;
  readonly relatedTarget?: unknown;
  stopPropagation(): void;
  preventDefault(): void;
}

interface ToolDocument {
  querySelector(selectors: string): unknown;
  createElement(tag: string): ToolNode;
  createElementNS(namespace: string, tag: string): ToolNode;
  addEventListener(type: string, listener: () => void, capture: boolean): void;
}

/** The parts of the button that change with its content. */
interface ToolParts {
  readonly tool: ToolNode;
  readonly apply: ToolNode;
  readonly more: ToolNode;
  readonly menu: ToolNode;
}

/** The button between renders: its host in WhatsApp's page, the way it applies, and what it last showed. */
interface ToolStore {
  readonly host: ToolNode;
  readonly shadow: ToolNode;
  readonly parts: ToolParts;
  readonly places: ToolPlaces;
  current: string;
  key: string | null;
  /** Shows the button only while the message box holds a draft. */
  readonly sync: () => void;
}

type Scope = Record<string, unknown>;

/** The message box's row, and the microphone's or Send's place in it, which the button goes before. */
interface ToolSpot {
  readonly row: ToolNode;
  readonly slot: ToolNode;
}

/** The button's helpers, passed in because each runs as its own source text. */
export interface ToolKit {
  readonly slot: (doc: ToolDocument, places: ToolPlaces) => ToolSpot | null;
  readonly paint: (scope: Scope, host: ToolNode, row: ToolNode) => void;
  readonly build: (doc: ToolDocument, scope: Scope, places: ToolPlaces, kit: ToolKit) => ToolStore;
  readonly node: (
    doc: ToolDocument,
    tag: string,
    name: string,
    parent: ToolNode,
    action?: string,
  ) => ToolNode;
  readonly show: (doc: ToolDocument, host: ToolNode, places: ToolPlaces) => void;
  readonly wire: (store: ToolStore, scope: Scope, kit: ToolKit) => void;
  readonly place: (scope: Scope, places: ToolPlaces, tool: ToolNode, menu: ToolNode) => void;
  readonly keys: (store: ToolStore) => void;
  readonly update: (
    doc: ToolDocument,
    store: ToolStore,
    content: ToolContent,
    kit: ToolKit,
  ) => void;
  readonly item: (
    doc: ToolDocument,
    store: ToolStore,
    option: ToolOption,
    kit: ToolKit,
  ) => ToolNode;
  readonly icon: (doc: ToolDocument, path: string, name?: string) => ToolNode;
}

/** Where a render left the button. */
type ToolPlacement = 'away' | 'kept' | 'placed';

/**
 * Keeps the rewrite button in WhatsApp's message box, right before its
 * microphone or Send button (#609). WhatsApp drops it when it redraws the
 * row, so every render puts the same button back, and changes it only when
 * its content changed. The page tells it when the user types, so it shows
 * as soon as there is a draft to rewrite, and hides once there is none.
 * Runs in the adapter's isolated world as source text, so it uses only its
 * arguments.
 */
export function renderComposerTool(
  doc: ToolDocument,
  scope: Scope,
  content: ToolContent,
  places: ToolPlaces,
  kit: ToolKit,
): ToolPlacement {
  const spot = content.visible ? kit.slot(doc, places) : null;
  const kept = scope[places.store] as ToolStore | undefined;
  if (spot === null) {
    kept?.host.remove();
    return 'away';
  }
  const store = kept ?? kit.build(doc, scope, places, kit);
  scope[places.store] = store;
  const placed = spot.slot.previousElementSibling !== store.host;
  if (placed) {
    spot.slot.before(store.host);
  }
  kit.paint(scope, store.host, spot.row);
  const key = JSON.stringify(content);
  if (store.key !== key) {
    store.key = key;
    kit.update(doc, store, content, kit);
  }
  store.sync();
  return placed ? 'placed' : 'kept';
}

/**
 * The microphone's or Send's place in the message box. WhatsApp lays the
 * box out as one rounded row: attach, emoji, the field in a box of its
 * own, the buttons that come and go with a draft, then the microphone,
 * which Send takes the place of. The button goes before that last part, so
 * it stays beside it either way. Null while no chat is open, or when the
 * row is laid out in another way, so the button stays away rather than
 * land somewhere odd.
 */
export function findComposerSlot(doc: ToolDocument, places: ToolPlaces): ToolSpot | null {
  const parentOf = (node: ToolNode | null): ToolNode | null => node?.parentElement ?? null;
  const box = parentOf(doc.querySelector(places.field) as ToolNode | null);
  const row = parentOf(box);
  const inFooter = row?.closest(places.footer) ?? null;
  if (row === null || inFooter === null || row.lastElementChild === box) {
    return null;
  }
  // The row holds the field's box, so it always has a last part.
  return { row, slot: row.lastElementChild } as ToolSpot;
}

/**
 * Follows WhatsApp's own theme, which can differ from the system's: light
 * text on the message box means its dark theme. Read anew on every render,
 * in case the user switches it.
 */
export function paintComposerTool(scope: Scope, host: ToolNode, row: ToolNode): void {
  const computed = scope['getComputedStyle'] as (node: ToolNode) => { readonly color: string };
  const [red = 0, green = 0, blue = 0] = (
    computed.call(scope, row).color.match(/\d+(?:\.\d+)?/g) ?? []
  ).map(Number);
  const light = 0.299 * red + 0.587 * green + 0.114 * blue > 128;
  host.dataset['theme'] = light ? 'dark' : 'light';
}

/**
 * Builds the button in a closed shadow root, as the bar is: WhatsApp's
 * scripts cannot reach into it, and its styles cannot restyle it. The page
 * tells the button when the user types, once, as the button is built once
 * per world; nothing about the draft leaves the page.
 */
export function buildComposerTool(
  doc: ToolDocument,
  scope: Scope,
  places: ToolPlaces,
  kit: ToolKit,
): ToolStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  kit.node(doc, 'style', 'style', shadow).textContent = places.style;
  const tool = kit.node(doc, 'div', 'tool', shadow);
  tool.setAttribute('role', 'group');
  const parts: ToolParts = {
    tool,
    apply: kit.node(doc, 'button', 'apply', tool, 'apply'),
    more: kit.node(doc, 'button', 'more', tool, 'more'),
    menu: kit.node(doc, 'div', 'menu', tool),
  };
  parts.more.append(kit.icon(doc, places.icons.caret));
  parts.more.setAttribute('aria-haspopup', 'menu');
  parts.more.setAttribute('aria-expanded', 'false');
  parts.menu.setAttribute('role', 'menu');
  parts.menu.hidden = true;
  const sync = (): void => {
    kit.show(doc, host, places);
  };
  const store: ToolStore = { host, shadow, parts, places, current: '', key: null, sync };
  kit.wire(store, scope, kit);
  kit.keys(store);
  doc.addEventListener('input', sync, true);
  return store;
}

/** One part of the button, with the class its styles use; a button names its action. */
export function composerToolNode(
  doc: ToolDocument,
  tag: string,
  name: string,
  parent: ToolNode,
  action?: string,
): ToolNode {
  const node = doc.createElement(tag);
  node.setAttribute('class', name);
  if (action !== undefined) {
    node.dataset['action'] = action;
    node.setAttribute('type', 'button');
  }
  parent.append(node);
  return node;
}

/** Shows the button only while the message box holds a draft to rewrite. */
export function showComposerTool(doc: ToolDocument, host: ToolNode, places: ToolPlaces): void {
  const field = doc.querySelector(places.field) as ToolNode | null;
  const empty = (field?.textContent ?? '').trim() === '';
  host.style.display = empty ? 'none' : '';
}

/** The bridge's actions, as the adapter world has them once the preload ran. */
type Actions = Record<string, ((value?: unknown) => void) | undefined>;

/**
 * Acts on the user's clicks only, never on clicks a page script made up.
 * A click keeps the focus in the message box, where the user was typing.
 * The open menu takes the focus, so it closes once the focus leaves it.
 */
export function wireComposerTool(store: ToolStore, scope: Scope, kit: ToolKit): void {
  const { tool, more, menu } = store.parts;
  const bridge = (): Actions => (scope[store.places.bridge] ?? {}) as Actions;
  const open = (shown: boolean): void => {
    menu.hidden = !shown;
    more.setAttribute('aria-expanded', String(shown));
    if (shown) {
      kit.place(scope, store.places, tool, menu);
      (
        menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('[role^="menuitem"]')
      )?.focus();
    }
  };
  tool.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  tool.addEventListener('click', (event) => {
    const control = event.isTrusted ? (event.target as ToolNode).closest('[data-action]') : null;
    if (control === null) {
      return;
    }
    const action = control.dataset['action'];
    if (action === 'more') {
      open(menu.hidden);
      return;
    }
    open(false);
    if (action === 'settings') {
      bridge()['settings']?.();
    } else {
      // A way in the menu names itself; the button rewrites in the selected way.
      bridge()['polish']?.(control.dataset['value'] ?? store.current);
    }
  });
  tool.addEventListener('focusout', (event) => {
    if (!tool.contains(event.relatedTarget)) {
      open(false);
    }
  });
}

/**
 * Opens the menu where it has room: upwards, over the chat, as the message
 * box sits at the bottom of the window, or downwards when there is more
 * room below, as in a window too short for it above. It never grows past
 * the window's edge, nor over the chat's header, which WhatsApp may draw
 * over it; a menu taller than the room scrolls.
 */
export function placeComposerMenu(
  scope: Scope,
  places: ToolPlaces,
  tool: ToolNode,
  menu: ToolNode,
): void {
  const margin = 16;
  const box = tool.getBoundingClientRect();
  const header = tool.ownerDocument.querySelector(places.header) as ToolNode | null;
  const above = box.top - (header?.getBoundingClientRect().bottom ?? 0);
  const below = Number(scope['innerHeight']) - box.bottom;
  const up = above >= menu.scrollHeight + margin || above >= below;
  menu.dataset['place'] = up ? 'above' : 'below';
  const room = Math.max((up ? above : below) - margin, 0);
  menu.style.setProperty('--room', `${String(room)}px`);
}

/**
 * Moves through the open menu with the arrow keys, Home and End; Escape
 * closes it and puts the focus back on the arrow that opened it. Keys
 * pressed here never reach WhatsApp's own shortcuts.
 */
export function composerToolKeys(store: ToolStore): void {
  const { tool, more, menu } = store.parts;
  const close = (key: string, event: ToolEvent): void => {
    menu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if (key === 'Escape') {
      event.preventDefault();
      more.focus();
    }
  };
  const steps: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
  const move = (key: string, event: ToolEvent): void => {
    const items = Array.from(menu.querySelectorAll('[role^="menuitem"]'));
    const at = items.indexOf(store.shadow.activeElement as ToolNode);
    const ends: Readonly<Record<string, number>> = { Home: 0, End: items.length - 1 };
    const step = steps[key];
    const next = step === undefined ? ends[key] : (at + step + items.length) % items.length;
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  };
  tool.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const key = String(event.key);
    if (menu.hidden) {
      return;
    }
    if (key === 'Escape' || key === 'Tab') {
      close(key, event);
    } else {
      move(key, event);
    }
  });
}

/**
 * Shows new content, as text only: the selected way's icon and name on the
 * button, so the user sees how it will rewrite, then every way in the menu
 * and, after a line, the assistant's settings with the model in use.
 */
export function updateComposerTool(
  doc: ToolDocument,
  store: ToolStore,
  content: ToolContent,
  kit: ToolKit,
): void {
  const { apply, more, menu, tool } = store.parts;
  const { label, settings, model } = content.labels;
  const found = content.options.find(({ value }) => value === content.current);
  // With no way selected, the button names the assistant and does nothing.
  const shown = found ?? { value: '', label, hint: label };
  store.current = shown.value;
  const name = doc.createElement('span');
  name.setAttribute('class', 'label');
  name.textContent = shown.label;
  const { modes, sparkle } = store.places.icons;
  apply.replaceChildren(kit.icon(doc, modes[shown.value] ?? sparkle, 'mode'), name);
  tool.setAttribute('aria-label', label);
  tool.setAttribute('aria-busy', String(content.working));
  apply.setAttribute('title', `${shown.label}: ${shown.hint}`);
  apply.disabled = content.working || found === undefined;
  more.setAttribute('aria-label', content.labels.more);
  more.setAttribute('title', content.labels.more);
  more.disabled = content.working;
  const line = doc.createElement('div');
  line.setAttribute('class', 'line');
  line.setAttribute('role', 'separator');
  const options = content.options.map((option) => kit.item(doc, store, option, kit));
  const setup = kit.item(doc, store, { value: '', label: settings, hint: model }, kit);
  menu.replaceChildren(...options, line, setup);
}

/**
 * One item in the menu: its icon, its name, what it does, and a check on
 * the selected way. The item without a value is the assistant's settings.
 */
export function composerToolItem(
  doc: ToolDocument,
  store: ToolStore,
  { value, label, hint }: ToolOption,
  kit: ToolKit,
): ToolNode {
  const item = doc.createElement('button');
  item.setAttribute('type', 'button');
  item.setAttribute('tabindex', '-1');
  const { modes, check, settings, sparkle } = store.places.icons;
  if (value === '') {
    item.setAttribute('class', 'item settings');
    item.setAttribute('role', 'menuitem');
    item.dataset['action'] = 'settings';
  } else {
    item.setAttribute('class', 'item');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(value === store.current));
    item.dataset['action'] = 'pick';
    item.dataset['value'] = value;
  }
  const name = doc.createElement('span');
  name.setAttribute('class', 'name');
  name.textContent = label;
  const about = doc.createElement('span');
  about.setAttribute('class', 'hint');
  about.textContent = hint;
  const icon = value === '' ? settings : (modes[value] ?? sparkle);
  item.append(kit.icon(doc, icon, 'mode'), name, about, kit.icon(doc, check, 'check'));
  return item;
}

/** A stroke icon on a 24 px grid, drawn in its class's color. */
export function composerToolIcon(doc: ToolDocument, path: string, name?: string): ToolNode {
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svgNs, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  if (name !== undefined) {
    icon.setAttribute('class', name);
  }
  const shape = doc.createElementNS(svgNs, 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
}

/**
 * The button's own styles, inside its shadow root: one pill in WhatsApp's
 * message box, the selected way's icon and name, then the arrow that opens
 * the menu upwards, over the chat. The assistant has its own accent, apart
 * from WhatsApp's green, in both of WhatsApp's themes (`ASSISTANT_THEME`).
 * The sparkle pulses while the assistant works, and holds still for people
 * who ask for less motion. Logical properties only, so it mirrors for
 * right-to-left languages (ADR 0012).
 */
const TOOL_STYLE = `${ASSISTANT_THEME}
:host { display: flex; flex: none; align-items: center; }
@keyframes breathe { to { opacity: 0.4; } }
.tool {
  position: relative; display: flex; align-items: stretch; box-sizing: border-box;
  block-size: 40px; margin-inline: 2px 4px; border: 1px solid var(--ai); border-radius: 20px;
  background: var(--ai-tint); color: var(--ai); font-family: inherit;
}
button {
  display: flex; align-items: center; padding: 0; border: 0; background: transparent;
  color: inherit; font: inherit; cursor: pointer;
}
button:disabled { cursor: default; }
button:focus-visible { outline: 2px solid var(--ai); outline-offset: 2px; }
svg {
  inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor; stroke-width: 1.8;
  stroke-linecap: round; stroke-linejoin: round;
}
.apply {
  gap: 6px; padding-inline: 12px 10px; border-start-start-radius: 19px;
  border-end-start-radius: 19px; font-size: 14px; font-weight: 600; white-space: nowrap;
}
.tool[aria-busy='true'] .apply .mode { animation: breathe 0.6s ease-in-out infinite alternate; }
.apply:disabled .label { opacity: 0.7; }
.more {
  min-inline-size: 36px; justify-content: center; border-inline-start: 1px solid var(--ai-border);
  border-start-end-radius: 19px; border-end-end-radius: 19px; background: var(--ai-split);
}
.more svg { inline-size: 18px; block-size: 18px; }
.apply:hover:not(:disabled), .more:hover:not(:disabled), .more[aria-expanded='true'] {
  background: var(--ai-hover);
}
.menu {
  position: absolute; inset-block-end: calc(100% + 10px); inset-inline-end: -1px; z-index: 10;
  display: flex; flex-direction: column; box-sizing: border-box;
  inline-size: min(320px, calc(100vw - 32px)); max-block-size: var(--room, 70vh); padding: 6px;
  overflow-y: auto; border-radius: 14px; background: var(--menu); color: var(--text);
  box-shadow: 0 8px 28px var(--shadow);
}
.menu[data-place='below'] { inset-block: calc(100% + 10px) auto; }
.menu[hidden] { display: none; }
.item {
  display: grid; grid-template-columns: 20px 1fr 20px; gap: 2px 12px; align-items: center;
  box-sizing: border-box; min-block-size: 56px; padding-block: 8px; padding-inline: 12px;
  border-radius: 10px; text-align: start;
}
.item.settings { min-block-size: 52px; }
.item:hover, .item:focus-visible { background: var(--hover); outline: none; }
.item[aria-checked='true'] { background: var(--ai-tint); }
.item .mode { grid-row: 1 / span 2; grid-column: 1; color: var(--ai); }
.name { grid-column: 2; font-size: 14px; font-weight: 600; }
.hint { grid-column: 2; font-size: 12.5px; line-height: 1.35; color: var(--muted); }
.check { grid-row: 1 / span 2; grid-column: 3; color: var(--ai); visibility: hidden; }
.item[aria-checked='true'] .check { visibility: visible; }
.line { block-size: 1px; margin-block: 6px; margin-inline: 6px; background: var(--border); }
@media (prefers-reduced-motion: reduce) {
  .tool[aria-busy='true'] .apply .mode { animation: none; }
}
`;

const PLACES: ToolPlaces = {
  field: LANDMARKS.composer,
  footer: LANDMARKS.composerFooter,
  header: LANDMARKS.conversationHeader,
  store: 'yapyapComposerToolView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: TOOL_STYLE,
  icons: {
    modes: {
      polish: ASSISTANT_ICONS.sparkle,
      shorten: ASSISTANT_ICONS.shorten,
      elaborate: ASSISTANT_ICONS.elaborate,
      soften: ASSISTANT_ICONS.soften,
      formalize: ASSISTANT_ICONS.formalize,
    },
    sparkle: ASSISTANT_ICONS.sparkle,
    caret: ASSISTANT_ICONS.caret,
    check: ASSISTANT_ICONS.check,
    settings: ASSISTANT_ICONS.settings,
  },
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function composerToolRender(content: ToolContent): string {
  const kit = [
    `slot: ${findComposerSlot.toString()}`,
    `paint: ${paintComposerTool.toString()}`,
    `build: ${buildComposerTool.toString()}`,
    `node: ${composerToolNode.toString()}`,
    `show: ${showComposerTool.toString()}`,
    `wire: ${wireComposerTool.toString()}`,
    `place: ${placeComposerMenu.toString()}`,
    `keys: ${composerToolKeys.toString()}`,
    `update: ${updateComposerTool.toString()}`,
    `item: ${composerToolItem.toString()}`,
    `icon: ${composerToolIcon.toString()}`,
  ].join(', ');
  return `(${renderComposerTool.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
