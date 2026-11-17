/**
 * What the parts YapYap draws in WhatsApp's page share (#650): the assistant's
 * bar, its rewrite button and the chat list's divider. Each runs in the
 * adapter's isolated world as source text, so a helper here reaches the page
 * only in the kit of each part that uses it, and uses only its arguments.
 */

/** The adapter world's globals, as each part's render gets them. */
export type Scope = Record<string, unknown>;

/** A bridge's actions, as the adapter world has them once the preload ran. */
export type Actions = Record<string, ((value?: unknown) => void) | undefined>;

/** The few DOM features the shared helpers use; the main process compiles them without DOM types. */
interface KitNode<N> {
  readonly dataset: Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  append(...nodes: N[]): void;
}

interface KitDocument<N> {
  createElement(tag: string): N;
  createElementNS(namespace: string, tag: string): N;
}

/** One part in a shadow root, with the class its styles use; a button names its action. */
export function shadowPart<N extends KitNode<N>>(
  doc: KitDocument<N>,
  tag: string,
  name: string,
  parent: N,
  action?: string,
): N {
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
 * A stroke icon on a 24 px grid, drawn in its class's color and hidden from
 * screen readers: the controls it sits in are labelled.
 */
export function strokeIcon<N extends KitNode<N>>(
  doc: KitDocument<N>,
  path: string,
  name?: string,
): N {
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
 * Follows WhatsApp's own theme, which can differ from the system's: light
 * text on `node` means its dark theme. Read anew on every render, in case
 * the user switches it.
 */
export function paintWhatsAppTheme(
  scope: Scope,
  host: { readonly dataset: Record<string, string | undefined> },
  node: unknown,
): void {
  const computed = scope['getComputedStyle'] as (node: unknown) => { readonly color: string };
  const [red = 0, green = 0, blue = 0] = (
    computed.call(scope, node).color.match(/\d+(?:\.\d+)?/g) ?? []
  ).map(Number);
  const light = 0.299 * red + 0.587 * green + 0.114 * blue > 128;
  host.dataset['theme'] = light ? 'dark' : 'light';
}
