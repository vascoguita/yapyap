import { ASSISTANT_BAR_BRIDGE } from '../shared/api/assistant-bar-api.ts';
import { LANDMARKS } from './page-state.ts';

/** One way the button rewrites the draft, in the user's words. */
interface ToolOption {
  readonly value: string;
  readonly label: string;
  /** What it does, shown under its name in the list. */
  readonly hint: string;
  /** The button's tooltip while it is the selected way. */
  readonly tip: string;
}

/** Everything the rewrite button in the message box shows, as plain JSON (#609). */
export interface ToolContent {
  readonly visible: boolean;
  /** The assistant answers a request; the button waits, and its edge turns faster. */
  readonly working: boolean;
  /** The way a click on the button rewrites, one of `options`. */
  readonly current: string;
  readonly options: readonly ToolOption[];
  readonly labels: { readonly label: string; readonly more: string };
}

/** Where the button goes and what it keeps, fixed for every render. */
interface ToolPlaces {
  /** WhatsApp's message box, whose row the button joins, and the row around it all. */
  readonly field: string;
  readonly footer: string;
  /** The adapter world's global that holds the button between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the bar's actions. */
  readonly bridge: string;
  readonly style: string;
  /** The icons' SVG paths, which the source text cannot reach as module constants. */
  readonly icons: { readonly sparkle: string; readonly caret: string; readonly check: string };
}

/** The few DOM features the button uses; the main process compiles this without DOM types. */
interface ToolNode {
  textContent: string | null;
  hidden: boolean;
  disabled: boolean;
  readonly parentElement: ToolNode | null;
  readonly lastElementChild: ToolNode | null;
  readonly previousElementSibling: unknown;
  readonly style: { setProperty(name: string, value: string): void };
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  append(...nodes: ToolNode[]): void;
  replaceChildren(...nodes: ToolNode[]): void;
  addEventListener(type: string, listener: (event: ToolEvent) => void): void;
  querySelector(selectors: string): ToolNode | null;
  closest(selectors: string): ToolNode | null;
  contains(node: unknown): boolean;
  before(node: ToolNode): void;
  remove(): void;
  focus(): void;
  attachShadow(init: { readonly mode: 'closed' }): ToolNode;
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
  readonly parts: ToolParts;
  readonly places: ToolPlaces;
  current: string;
  key: string | null;
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
  readonly wire: (store: ToolStore, scope: Scope) => void;
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
  readonly icon: (doc: ToolDocument, path: string) => ToolNode;
}

/** Where a render left the button. */
type ToolPlacement = 'away' | 'kept' | 'placed';

/**
 * Keeps the rewrite button in WhatsApp's message box, right before its
 * microphone or Send button (#609). WhatsApp drops it when it redraws the
 * row, so every render puts the same button back, and changes it only when
 * its content changed. Runs in the adapter's isolated world as source
 * text, so it uses only its arguments.
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
  const slot = row?.lastElementChild ?? null;
  if (row === null || slot === null || slot === box || row.closest(places.footer) === null) {
    return null;
  }
  return { row, slot };
}

/** Gives the button WhatsApp's own colors, read anew in case the user switches its theme. */
export function paintComposerTool(scope: Scope, host: ToolNode, row: ToolNode): void {
  const computed = scope['getComputedStyle'] as (node: ToolNode) => {
    readonly color: string;
    readonly backgroundColor: string;
  };
  const { color, backgroundColor } = computed.call(scope, row);
  host.style.setProperty('--wa-text', color);
  host.style.setProperty('--wa-surface', backgroundColor);
}

/**
 * Builds the button in a closed shadow root, as the bar is: WhatsApp's
 * scripts cannot reach into it, and its styles cannot restyle it.
 */
export function buildComposerTool(
  doc: ToolDocument,
  scope: Scope,
  places: ToolPlaces,
  kit: ToolKit,
): ToolStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const make = (tag: string, name: string, parent: ToolNode, action?: string): ToolNode => {
    const node = doc.createElement(tag);
    node.setAttribute('class', name);
    if (action !== undefined) {
      node.dataset['action'] = action;
      node.setAttribute('type', 'button');
    }
    parent.append(node);
    return node;
  };
  make('style', 'style', shadow).textContent = places.style;
  const tool = make('div', 'tool', shadow);
  tool.setAttribute('role', 'group');
  const parts: ToolParts = {
    tool,
    apply: make('button', 'apply', tool, 'apply'),
    more: make('button', 'more', tool, 'more'),
    menu: make('div', 'menu', tool),
  };
  parts.apply.append(kit.icon(doc, places.icons.sparkle));
  parts.more.append(kit.icon(doc, places.icons.caret));
  parts.more.setAttribute('aria-haspopup', 'menu');
  parts.more.setAttribute('aria-expanded', 'false');
  parts.menu.setAttribute('role', 'menu');
  parts.menu.hidden = true;
  const store: ToolStore = { host, parts, places, current: '', key: null };
  kit.wire(store, scope);
  return store;
}

/** The bridge's actions, as the adapter world has them once the preload ran. */
type Actions = Record<string, ((value?: unknown) => void) | undefined>;

/**
 * Acts on the user's clicks only, never on clicks a page script made up.
 * A click keeps the focus in the message box, where the user was typing.
 * The open list takes the focus, so it closes once the focus leaves it,
 * and keys pressed in it never reach WhatsApp's shortcuts.
 */
export function wireComposerTool(store: ToolStore, scope: Scope): void {
  const { tool, more, menu } = store.parts;
  const open = (shown: boolean): void => {
    menu.hidden = !shown;
    more.setAttribute('aria-expanded', String(shown));
    if (shown) {
      menu.querySelector('[aria-checked="true"]')?.focus();
    }
  };
  const polish = (value: string): void => {
    open(false);
    ((scope[store.places.bridge] ?? {}) as Actions)['polish']?.(value);
  };
  tool.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  tool.addEventListener('click', (event) => {
    const control = event.isTrusted ? (event.target as ToolNode).closest('[data-action]') : null;
    const action = control?.dataset['action'];
    if (action === 'more') {
      open(menu.hidden);
    } else if (action === 'apply') {
      polish(store.current);
    } else if (action === 'pick') {
      polish(String(control?.dataset['value']));
    }
  });
  tool.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !menu.hidden) {
      open(false);
      more.focus();
    }
  });
  tool.addEventListener('focusout', (event) => {
    if (!tool.contains(event.relatedTarget)) {
      open(false);
    }
  });
}

/** Shows new content: the selected way on the button, and every way in the list, as text only. */
export function updateComposerTool(
  doc: ToolDocument,
  store: ToolStore,
  content: ToolContent,
  kit: ToolKit,
): void {
  const { apply, more, menu, tool } = store.parts;
  const current = content.options.find(({ value }) => value === content.current);
  store.current = current?.value ?? '';
  tool.setAttribute('aria-label', content.labels.label);
  tool.setAttribute('aria-busy', String(content.working));
  apply.setAttribute('aria-label', current?.label ?? content.labels.label);
  apply.setAttribute('title', current?.tip ?? content.labels.label);
  apply.disabled = content.working || current === undefined;
  more.setAttribute('aria-label', content.labels.more);
  more.setAttribute('title', content.labels.more);
  more.disabled = content.working;
  menu.replaceChildren(...content.options.map((option) => kit.item(doc, store, option, kit)));
}

/** One way in the list: its name, what it does, and a tick when it is the selected one. */
export function composerToolItem(
  doc: ToolDocument,
  store: ToolStore,
  { value, label, hint }: ToolOption,
  kit: ToolKit,
): ToolNode {
  const item = doc.createElement('button');
  item.setAttribute('class', 'item');
  item.setAttribute('type', 'button');
  item.setAttribute('role', 'menuitemradio');
  item.setAttribute('aria-checked', String(value === store.current));
  item.dataset['action'] = 'pick';
  item.dataset['value'] = value;
  const check = kit.icon(doc, store.places.icons.check);
  check.setAttribute('class', 'check');
  const name = doc.createElement('span');
  name.setAttribute('class', 'name');
  name.textContent = label;
  const about = doc.createElement('span');
  about.setAttribute('class', 'hint');
  about.textContent = hint;
  item.append(check, name, about);
  return item;
}

/** A 24 px icon drawn in the text's color, as WhatsApp draws its own. */
export function composerToolIcon(doc: ToolDocument, path: string): ToolNode {
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svgNs, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const shape = doc.createElementNS(svgNs, 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
}

/**
 * The button's own styles, inside its shadow root. It takes WhatsApp's
 * colors from the message box, so it matches either theme, and copies its
 * 40 px round buttons. A gradient edge that slowly turns marks it as the
 * assistant, and turns faster while it works. The edge turns by rotating
 * the round ring itself: Chromium ignores `@property` in a shadow root, so
 * the gradient's angle cannot be animated there. It holds still for people
 * who ask for less motion. Logical properties only, so it mirrors for
 * right-to-left languages (ADR 0012).
 */
const TOOL_STYLE = `
:host { display: flex; flex: none; align-items: center; color: var(--wa-text, inherit); }
@keyframes turn { to { transform: rotate(1turn); } }
.tool {
  --shine: conic-gradient(#25d366, #53bdeb, #a78bfa, #ff9ad5, #25d366);
  position: relative; display: flex; align-items: center;
}
button {
  display: grid; place-items: center; padding: 0; border: 0; background: transparent;
  color: inherit; font: inherit; cursor: pointer;
}
button:disabled { cursor: default; }
button:focus-visible { outline: 2px solid #25d366; outline-offset: 1px; }
svg { inline-size: 24px; block-size: 24px; fill: currentColor; }
.apply {
  position: relative; inline-size: 40px; block-size: 40px; border-radius: 9999px;
  isolation: isolate;
}
.apply::before, .apply::after {
  position: absolute; inset: 4px; z-index: -1; border-radius: inherit; content: '';
  background: var(--shine); animation: turn 6s linear infinite;
}
.apply::before {
  padding: 1.5px;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
.apply::after { opacity: 0.18; filter: blur(6px); transition: opacity 0.2s; }
.apply:hover:not(:disabled)::after { opacity: 0.4; }
.tool[aria-busy='true'] .apply::before, .tool[aria-busy='true'] .apply::after {
  animation-duration: 1.2s;
}
.tool[aria-busy='true'] .apply::after { opacity: 0.5; }
.apply:disabled svg { opacity: 0.6; }
.more {
  inline-size: 20px; block-size: 40px; margin-inline-start: -2px; border-radius: 9999px;
  opacity: 0.7;
}
.more:hover:not(:disabled) { opacity: 1; }
.more svg { inline-size: 18px; block-size: 18px; }
.menu {
  position: absolute; inset-block-end: calc(100% + 14px); inset-inline-end: -8px; z-index: 10;
  display: flex; flex-direction: column; gap: 2px; box-sizing: border-box;
  inline-size: max-content; max-inline-size: min(340px, 80vw); padding: 6px;
  border: 1px solid transparent; border-radius: 16px;
  background: linear-gradient(var(--wa-surface, Canvas), var(--wa-surface, Canvas)) padding-box,
    var(--shine) border-box;
  box-shadow: 0 2px 5px rgb(11 20 26 / 26%), 0 8px 24px rgb(11 20 26 / 16%);
}
.menu[hidden] { display: none; }
.item {
  display: grid; grid-template-columns: 20px 1fr; gap: 2px 10px; place-items: center start;
  padding-block: 8px; padding-inline: 8px 12px; border-radius: 10px; text-align: start;
}
.item:hover, .item:focus-visible { background: color-mix(in srgb, currentColor 9%, transparent); }
.item:focus-visible { outline-offset: -2px; }
.check {
  grid-row: span 2; inline-size: 20px; block-size: 20px; fill: #25d366; visibility: hidden;
}
.item[aria-checked='true'] .check { visibility: visible; }
.name { font-size: 14.5px; font-weight: 500; }
.hint { font-size: 12.5px; line-height: 1.35; opacity: 0.7; }
@media (prefers-reduced-motion: reduce) {
  .apply::before, .apply::after { animation: none; }
}
`;

const PLACES: ToolPlaces = {
  field: LANDMARKS.composer,
  footer: LANDMARKS.composerFooter,
  store: 'yapyapComposerToolView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: TOOL_STYLE,
  icons: {
    // Sparkles: a large four-pointed star and a small one.
    sparkle:
      'M10.5 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 10l4.8-1.7zM17.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z',
    // A chevron pointing up, since the list opens upwards, above the message box.
    caret: 'M7.4 15.4 12 10.8l4.6 4.6 1.4-1.4-6-6-6 6z',
    check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  },
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function composerToolRender(content: ToolContent): string {
  const kit = [
    `slot: ${findComposerSlot.toString()}`,
    `paint: ${paintComposerTool.toString()}`,
    `build: ${buildComposerTool.toString()}`,
    `wire: ${wireComposerTool.toString()}`,
    `update: ${updateComposerTool.toString()}`,
    `item: ${composerToolItem.toString()}`,
    `icon: ${composerToolIcon.toString()}`,
  ].join(', ');
  return `(${renderComposerTool.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
