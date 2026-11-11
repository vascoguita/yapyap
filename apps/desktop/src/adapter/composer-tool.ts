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
  readonly icons: {
    /** Each way's own icon, by its value; the sparkles stand for a way without one. */
    readonly modes: Readonly<Record<string, string>>;
    readonly sparkle: string;
    readonly caret: string;
    readonly check: string;
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
  readonly icon: (doc: ToolDocument, path: string, name?: string) => ToolNode;
  readonly shine: (doc: ToolDocument) => ToolNode;
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
  shadow.append(kit.shine(doc));
  const tool = make('div', 'tool', shadow);
  tool.setAttribute('role', 'group');
  const parts: ToolParts = {
    tool,
    apply: make('button', 'apply', tool, 'apply'),
    more: make('button', 'more', tool, 'more'),
    menu: make('div', 'menu', tool),
  };
  parts.more.append(kit.icon(doc, places.icons.caret));
  parts.more.setAttribute('aria-haspopup', 'menu');
  parts.more.setAttribute('aria-expanded', 'false');
  parts.menu.setAttribute('role', 'menu');
  parts.menu.setAttribute('tabindex', '-1');
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
      menu.focus();
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

/**
 * Shows new content, as text only: the selected way's icon and name on the
 * button, so the user sees how it will rewrite, and every way in the list.
 */
export function updateComposerTool(
  doc: ToolDocument,
  store: ToolStore,
  content: ToolContent,
  kit: ToolKit,
): void {
  const { apply, more, menu, tool } = store.parts;
  const { label } = content.labels;
  const found = content.options.find(({ value }) => value === content.current);
  // With no way selected, the button names the assistant and does nothing.
  const shown = found ?? { value: '', label, tip: label };
  store.current = shown.value;
  const name = doc.createElement('span');
  name.setAttribute('class', 'label');
  name.textContent = shown.label;
  const { modes, sparkle } = store.places.icons;
  apply.replaceChildren(kit.icon(doc, modes[shown.value] ?? sparkle, 'mode'), name);
  tool.setAttribute('aria-label', label);
  tool.setAttribute('aria-busy', String(content.working));
  apply.setAttribute('aria-label', shown.label);
  apply.setAttribute('title', shown.tip);
  apply.disabled = content.working || found === undefined;
  more.setAttribute('aria-label', content.labels.more);
  more.setAttribute('title', content.labels.more);
  more.disabled = content.working;
  menu.replaceChildren(...content.options.map((option) => kit.item(doc, store, option, kit)));
}

/** One way in the list: its icon, its name, what it does, and a tick when it is the selected one. */
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
  const { modes, sparkle, check } = store.places.icons;
  const name = doc.createElement('span');
  name.setAttribute('class', 'name');
  name.textContent = label;
  const about = doc.createElement('span');
  about.setAttribute('class', 'hint');
  about.textContent = hint;
  item.append(
    kit.icon(doc, modes[value] ?? sparkle, 'mode'),
    name,
    about,
    kit.icon(doc, check, 'check'),
  );
  return item;
}

/** A 24 px icon, drawn in the text's color as WhatsApp draws its own unless its class says otherwise. */
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
 * The gradient the ways' icons are painted with, the colors of the
 * button's edge. Its ID is the shadow root's own, so the page cannot clash
 * with it.
 */
export function composerToolShine(doc: ToolDocument): ToolNode {
  const svgNs = 'http://www.w3.org/2000/svg';
  const holder = doc.createElementNS(svgNs, 'svg');
  holder.setAttribute('class', 'defs');
  holder.setAttribute('aria-hidden', 'true');
  const gradient = doc.createElementNS(svgNs, 'linearGradient');
  gradient.setAttribute('id', 'shine');
  gradient.setAttribute('x2', '1');
  gradient.setAttribute('y2', '1');
  for (const [offset, color] of [
    ['0', '#25d366'],
    ['0.5', '#53bdeb'],
    ['1', '#a78bfa'],
  ]) {
    const stop = doc.createElementNS(svgNs, 'stop');
    stop.setAttribute('offset', String(offset));
    stop.setAttribute('stop-color', String(color));
    gradient.append(stop);
  }
  holder.append(gradient);
  return holder;
}

/**
 * The button's own styles, inside its shadow root. It is one chip in
 * WhatsApp's message box: the selected way's icon and name, then the arrow
 * that opens the other ways, inside one gradient edge, so the arrow reads
 * as part of the assistant. It takes WhatsApp's colors from the message
 * box, so it matches either theme, and its font. A sheen runs along the
 * edge, faster while the assistant works. It moves the gradient rather
 * than turn it, since Chromium ignores `@property` in a shadow root; the
 * gradient repeats once across twice the chip's width, so each pass joins
 * the next. It holds still for people who ask for less motion. Logical
 * properties only, so it mirrors for right-to-left languages (ADR 0012).
 */
const TOOL_STYLE = `
:host { display: flex; flex: none; align-items: center; color: var(--wa-text, inherit); }
@keyframes sheen { from { background-position: 0 0, 0 0; } to { background-position: 0 0, 100% 0; } }
@keyframes breathe { to { opacity: 0.45; } }
.defs { position: absolute; inline-size: 0; block-size: 0; }
.tool {
  --shine: linear-gradient(90deg, #25d366, #53bdeb, #a78bfa, #ff9ad5, #25d366, #53bdeb, #a78bfa,
    #ff9ad5, #25d366);
  --hover: color-mix(in srgb, currentColor 8%, transparent);
  position: relative; display: flex; align-items: stretch; box-sizing: border-box;
  block-size: 36px; margin-inline: 2px 4px; border: 1.5px solid transparent; border-radius: 18px;
  background: linear-gradient(var(--wa-surface, Canvas), var(--wa-surface, Canvas)) padding-box,
    var(--shine) border-box;
  background-size: 100% 100%, 200% 100%;
  box-shadow: 0 0 12px -5px #53bdeb; animation: sheen 8s linear infinite;
  transition: box-shadow 0.2s;
}
.tool:hover { box-shadow: 0 0 14px -3px #53bdeb; }
.tool[aria-busy='true'] { animation-duration: 1.5s; box-shadow: 0 0 16px -2px #a78bfa; }
button {
  display: flex; align-items: center; padding: 0; border: 0; background: transparent;
  color: inherit; font: inherit; cursor: pointer;
}
button:disabled { cursor: default; }
button:focus-visible { outline: 2px solid #25d366; outline-offset: -2px; }
svg { inline-size: 24px; block-size: 24px; fill: currentColor; }
.mode { fill: url(#shine); }
.apply {
  gap: 6px; padding-inline: 9px 8px; border-start-start-radius: 16px;
  border-end-start-radius: 16px; font-size: 14px; font-weight: 500; white-space: nowrap;
}
.apply .mode { inline-size: 20px; block-size: 20px; }
.tool[aria-busy='true'] .apply .mode { animation: breathe 0.6s ease-in-out infinite alternate; }
.apply:disabled .label { opacity: 0.6; }
.more {
  padding-inline: 3px 5px; border-inline-start: 1px solid var(--hover);
  border-start-end-radius: 16px; border-end-end-radius: 16px;
}
.more svg { inline-size: 18px; block-size: 18px; opacity: 0.8; }
.apply:hover:not(:disabled), .more:hover:not(:disabled), .more[aria-expanded='true'] {
  background: var(--hover);
}
.menu {
  position: absolute; inset-block-end: calc(100% + 12px); inset-inline-end: -4px; z-index: 10;
  display: flex; flex-direction: column; gap: 2px; box-sizing: border-box;
  inline-size: max-content; max-inline-size: min(360px, 80vw); padding: 6px;
  border: 1px solid transparent; border-radius: 16px;
  background: linear-gradient(var(--wa-surface, Canvas), var(--wa-surface, Canvas)) padding-box,
    linear-gradient(135deg, #25d366, #53bdeb, #a78bfa, #ff9ad5) border-box;
  box-shadow: 0 2px 5px rgb(11 20 26 / 26%), 0 8px 24px rgb(11 20 26 / 16%);
}
.menu:focus { outline: none; }
.menu[hidden] { display: none; }
.item {
  display: grid; grid-template-columns: 24px 1fr 20px; gap: 2px 12px; align-items: center;
  padding-block: 8px; padding-inline: 10px; border-radius: 10px; text-align: start;
}
.item:hover, .item:focus-visible { background: var(--hover); }
.item .mode { grid-row: 1 / span 2; grid-column: 1; }
.name { grid-column: 2; font-size: 14.5px; font-weight: 500; }
.hint { grid-column: 2; font-size: 12.5px; line-height: 1.35; opacity: 0.7; }
.check {
  grid-row: 1 / span 2; grid-column: 3; inline-size: 20px; block-size: 20px; fill: #25d366;
  visibility: hidden;
}
.item[aria-checked='true'] .check { visibility: visible; }
@media (prefers-reduced-motion: reduce) {
  .tool, .tool[aria-busy='true'] .apply .mode { animation: none; }
}
`;

/** Sparkles: a large four-pointed star and a small one, the assistant's own mark. */
const SPARKLE =
  'M10.5 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 10l4.8-1.7zM17.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z';

const PLACES: ToolPlaces = {
  field: LANDMARKS.composer,
  footer: LANDMARKS.composerFooter,
  store: 'yapyapComposerToolView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: TOOL_STYLE,
  icons: {
    modes: {
      // Sparkles, for a draft made to shine.
      polish: SPARKLE,
      // Lines that get shorter.
      shorten: 'M4 5h16v2H4zm0 6h11v2H4zm0 6h6v2H4z',
      // Lines with a plus: more of them.
      elaborate: 'M4 5h16v2H4zm0 6h16v2H4zm0 6h8v2H4zm13-2h2v3h3v2h-3v3h-2v-3h-3v-2h3z',
      // A briefcase, for a professional tone.
      formalize:
        'M10 3h4a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 2v2h4V5zM5 12v6h14v-6z',
    },
    sparkle: SPARKLE,
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
    `shine: ${composerToolShine.toString()}`,
  ].join(', ');
  return `(${renderComposerTool.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
