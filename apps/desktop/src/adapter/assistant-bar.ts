import { ASSISTANT_BAR_BRIDGE } from '../shared/assistant-bar-api.ts';
import { LANDMARKS } from './page-state.ts';

/** YapYap's own words on the bar, in the user's language. */
export interface BarLabels {
  readonly label: string;
  readonly from: string;
  readonly suggest: string;
  readonly use: string;
  readonly sendLabel: string;
  readonly write: string;
  readonly writePlaceholder: string;
}

/** Everything the bar shows, as plain JSON: YapYap's labels and the extension's text. */
export interface BarContent {
  readonly visible: boolean;
  readonly labels: BarLabels;
  readonly status: string;
  readonly suggestions: readonly string[];
  /** The label of the extension's question's button, or null for none. */
  readonly confirm: string | null;
  readonly working: boolean;
  /** The extension's choice, such as its model, or null for none. */
  readonly choice: {
    readonly label: string;
    readonly current: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
  } | null;
}

/** Where the bar goes and what it keeps, fixed for every render. */
interface BarPlaces {
  /** The open chat's message box row, which the bar sits right above. */
  readonly footer: string;
  /** The adapter world's global that holds the bar between renders. */
  readonly store: string;
  /** The adapter world's global the WhatsApp preload exposes for the bar's actions. */
  readonly bridge: string;
  readonly style: string;
  readonly maxPrompt: number;
}

/** The few DOM features the bar uses; the main process compiles this without DOM types. */
interface BarNode {
  textContent: string | null;
  hidden: boolean;
  disabled: boolean;
  value: string;
  readonly previousElementSibling: unknown;
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
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
  readonly isComposing?: boolean;
  readonly key?: string;
  readonly target: unknown;
  stopPropagation(): void;
  preventDefault(): void;
}

interface BarDocument {
  querySelector(selectors: string): unknown;
  createElement(tag: string): BarNode;
  createElementNS(namespace: string, tag: string): BarNode;
}

/** The parts of the bar that change with its content. */
interface BarParts {
  readonly bar: BarNode;
  readonly from: BarNode;
  readonly suggest: BarNode;
  readonly status: BarNode;
  readonly confirm: BarNode;
  readonly choice: BarNode;
  readonly list: BarNode;
  readonly input: BarNode;
}

/** The bar between renders: its host in WhatsApp's page, and what it last showed. */
interface BarStore {
  readonly host: BarNode;
  readonly parts: BarParts;
  key: string | null;
}

type Scope = Record<string, unknown>;

/** The bar's helpers, passed in because each runs as its own source text. */
export interface BarKit {
  readonly build: (doc: BarDocument, scope: Scope, places: BarPlaces, kit: BarKit) => BarStore;
  readonly wire: (shadow: BarNode, parts: BarParts, scope: Scope, bridge: string) => void;
  readonly update: (doc: BarDocument, parts: BarParts, content: BarContent, kit: BarKit) => void;
  readonly choose: (doc: BarDocument, select: BarNode, content: BarContent) => void;
  readonly suggestion: (
    doc: BarDocument,
    text: string,
    index: number,
    labels: BarLabels,
  ) => BarNode;
}

/**
 * Keeps the assistant bar right above the open chat's message box, so the
 * conversation moves up to make room (ADR 0013). Runs in the adapter's
 * isolated world as source text, so it uses only its arguments. WhatsApp
 * drops the bar when it redraws a chat, so every render puts the same bar
 * back; it changes the bar only when its content changed, and reports only
 * whether the bar is on the page.
 */
export function renderAssistantBar(
  doc: BarDocument,
  scope: Scope,
  content: BarContent,
  places: BarPlaces,
  kit: BarKit,
): boolean {
  const footer = doc.querySelector(places.footer) as BarNode | null;
  const kept = scope[places.store] as BarStore | undefined;
  if (!content.visible || footer === null) {
    kept?.host.remove();
    return false;
  }
  const store = kept ?? kit.build(doc, scope, places, kit);
  scope[places.store] = store;
  if (footer.previousElementSibling !== store.host) {
    footer.before(store.host);
  }
  const key = JSON.stringify(content);
  if (store.key !== key) {
    store.key = key;
    kit.update(doc, store.parts, content, kit);
  }
  return true;
}

/**
 * Builds the bar in a closed shadow root: WhatsApp's scripts cannot reach
 * into it to read the suggestions, and its styles cannot restyle it.
 */
export function buildAssistantBar(
  doc: BarDocument,
  scope: Scope,
  places: BarPlaces,
  kit: BarKit,
): BarStore {
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const make = (tag: string, name: string, parent: BarNode): BarNode => {
    const node = doc.createElement(tag);
    node.setAttribute('class', name);
    parent.append(node);
    return node;
  };
  const style = doc.createElement('style');
  style.textContent = places.style;
  shadow.append(style);
  const bar = make('section', 'bar', shadow);
  const row = make('div', 'row', bar);
  const parts: BarParts = {
    bar,
    from: make('span', 'from', row),
    // Right after the extension's name, so "AI assistant · model" reads as one phrase.
    choice: make('select', 'choice', row),
    suggest: make('button', 'button primary', row),
    status: make('output', 'status', row),
    confirm: make('button', 'button', row),
    list: make('ul', 'suggestions', bar),
    input: make('input', 'input', bar),
  };
  parts.suggest.dataset['action'] = 'suggest';
  parts.confirm.dataset['action'] = 'confirm';
  parts.input.setAttribute('type', 'text');
  parts.input.setAttribute('maxlength', String(places.maxPrompt));
  kit.wire(shadow, parts, scope, places.bridge);
  return { host, parts, key: null };
}

/**
 * Acts on the user's clicks and on Enter in the field, never on events a
 * page script made up, and keeps typing in the bar from reaching WhatsApp's
 * own keyboard shortcuts.
 */
export function wireAssistantBar(
  shadow: BarNode,
  parts: BarParts,
  scope: Scope,
  key: string,
): void {
  const { input, choice } = parts;
  type Actions = Record<string, ((value: unknown) => void) | undefined>;
  const bridge = (): Actions => (scope[key] ?? {}) as Actions;
  const typing = ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'paste', 'cut', 'copy'];
  for (const type of typing) {
    shadow.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
  shadow.addEventListener('click', (event) => {
    const button = event.isTrusted ? (event.target as BarNode).closest('[data-action]') : null;
    if (button !== null) {
      bridge()[String(button.dataset['action'])]?.(Number(button.dataset['index']));
    }
  });
  choice.addEventListener('change', (event) => {
    if (event.isTrusted) {
      bridge()['choose']?.(choice.value);
    }
  });
  input.addEventListener('keydown', (event) => {
    const text = input.value;
    if (!event.isTrusted || event.isComposing === true || event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (text.trim() !== '') {
      input.value = '';
      bridge()['prompt']?.(text);
    }
  });
}

/** Shows new content, writing the extension's text only as text, never as markup. */
export function updateAssistantBar(
  doc: BarDocument,
  parts: BarParts,
  content: BarContent,
  kit: BarKit,
): void {
  const { labels } = content;
  const name = 'aria-label';
  parts.bar.setAttribute(name, labels.label);
  parts.from.textContent = labels.from;
  parts.suggest.textContent = labels.suggest;
  parts.suggest.disabled = content.working;
  parts.status.textContent = content.status;
  parts.confirm.textContent = content.confirm ?? '';
  parts.confirm.hidden = content.confirm === null;
  parts.input.disabled = content.working;
  parts.input.setAttribute(name, labels.write);
  parts.input.setAttribute('placeholder', labels.writePlaceholder);
  parts.list.replaceChildren(
    ...content.suggestions.map((text, index) => kit.suggestion(doc, text, index, labels)),
  );
  parts.choice.setAttribute(name, content.choice?.label ?? '');
  kit.choose(doc, parts.choice, content);
}

/** The extension's choice, such as its model, shown as a list only when there is one to pick from. */
export function updateAssistantChoice(
  doc: BarDocument,
  select: BarNode,
  content: BarContent,
): void {
  const choice = content.choice ?? { label: '', current: '', options: [] };
  select.hidden = choice.options.length === 0;
  select.disabled = content.working;
  select.replaceChildren(
    ...choice.options.map((option) => {
      const node = doc.createElement('option');
      node.setAttribute('value', option.value);
      node.textContent = option.label;
      return node;
    }),
  );
  select.value = choice.current;
}

/** One suggestion: its text puts it in the message box; the arrow sends it, on this click only. */
export function assistantSuggestion(
  doc: BarDocument,
  text: string,
  index: number,
  labels: BarLabels,
): BarNode {
  const item = doc.createElement('li');
  const use = doc.createElement('button');
  const send = doc.createElement('button');
  for (const [button, action] of [
    [use, 'use'],
    [send, 'send'],
  ] as const) {
    button.setAttribute('class', `button ${action}`);
    button.dataset['action'] = action;
    button.dataset['index'] = String(index);
  }
  use.textContent = text;
  use.setAttribute('title', labels.use);
  send.setAttribute('aria-label', labels.sendLabel);
  send.setAttribute('title', labels.sendLabel);
  // A paper plane, drawn rather than written, so it reads in every language.
  const svg = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(svg, 'svg');
  const path = doc.createElementNS(svg, 'path');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'M2 8l12-6-4 12-2-5z');
  icon.append(path);
  send.append(icon);
  item.append(use, send);
  return item;
}

/**
 * The bar's own styles, inside its shadow root. They follow the system's
 * light or dark scheme, as WhatsApp does by default, keep the bar's height
 * fixed so the chat does not jump while it waits, and use logical properties
 * only, so it mirrors for right-to-left languages (ADR 0012).
 */
const BAR_STYLE = `
:host { display: block; color-scheme: light dark; }
.bar {
  --text: light-dark(#111b21, #e9edef); --muted: light-dark(#667781, #8696a0);
  --accent: light-dark(#008069, #00a884); --border: light-dark(#d1d7db, #374248);
  --surface: light-dark(#f0f2f5, #202c33);
  display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; block-size: 112px;
  padding: 8px 12px; border-block-start: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-family: inherit; font-size: 0.9rem;
}
.row { display: flex; align-items: center; gap: 10px; min-inline-size: 0; }
.from, .status { color: var(--muted); white-space: nowrap; }
.status { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; }
.button {
  padding: 3px 12px; border: 1px solid var(--border); border-radius: 999px; background: transparent;
  color: var(--text); font: inherit; cursor: pointer;
}
.button.primary { border-color: var(--accent); background: var(--accent); color: var(--surface); }
.button:disabled, .input:disabled { opacity: 0.6; cursor: default; }
.button:focus-visible, .input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.suggestions {
  display: flex; gap: 8px; min-block-size: 28px; margin: 0; padding: 0; overflow-x: auto; list-style: none;
}
li { display: flex; flex: none; max-inline-size: 60%; }
.use {
  overflow: hidden; border-start-end-radius: 0; border-end-end-radius: 0; text-overflow: ellipsis;
  white-space: nowrap;
}
.send {
  display: grid; place-items: center; padding: 3px 10px; border-inline-start: 0;
  border-start-start-radius: 0; border-end-start-radius: 0; color: var(--accent);
}
svg { inline-size: 14px; block-size: 14px; fill: currentColor; }
.choice {
  max-inline-size: 40%; padding: 2px 8px; border: 1px solid var(--border); border-radius: 999px;
  background: transparent; color: var(--muted); font: inherit;
}
.choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.input {
  box-sizing: border-box; inline-size: 100%; padding: 5px 12px; border: 1px solid var(--border);
  border-radius: 999px; background: transparent; color: var(--text); font: inherit;
}
`;

/** Longest request a user can type in the bar; the main process checks it again. */
export const MAX_PROMPT = 2000;

const PLACES: BarPlaces = {
  footer: LANDMARKS.composerFooter,
  store: 'yapyapAssistantBarView',
  bridge: ASSISTANT_BAR_BRIDGE,
  style: BAR_STYLE,
  maxPrompt: MAX_PROMPT,
};

/** The render as code for `executeJavaScriptInIsolatedWorld`, with the content as JSON. */
export function assistantBarRender(content: BarContent): string {
  const kit = [
    `build: ${buildAssistantBar.toString()}`,
    `wire: ${wireAssistantBar.toString()}`,
    `update: ${updateAssistantBar.toString()}`,
    `choose: ${updateAssistantChoice.toString()}`,
    `suggestion: ${assistantSuggestion.toString()}`,
  ].join(', ');
  return `(${renderAssistantBar.toString()})(document, globalThis, ${JSON.stringify(content)}, ${JSON.stringify(PLACES)}, { ${kit} })`;
}
