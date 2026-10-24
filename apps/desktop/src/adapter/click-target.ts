import { LANDMARKS } from './page-state.ts';

/** Where in WhatsApp the user right-clicked, as far as plugins' menu items care. */
export type ClickTarget = 'composer' | 'message' | 'chat' | 'other';

interface HitDocument {
  elementFromPoint(x: number, y: number): unknown;
}

interface Places {
  readonly composer: string;
  readonly conversation: string;
  readonly chatList: string;
}

/**
 * Names the part of the page under a right click. Runs inside the page as
 * source text, so it must stay self-contained. It reads no text and reports
 * only which landmark holds the point.
 */
export function clickTarget(doc: HitDocument, x: number, y: number, places: Places): ClickTarget {
  const element = doc.elementFromPoint(x, y) as { closest?: (selector: string) => unknown } | null;
  if (typeof element?.closest !== 'function') {
    return 'other';
  }
  const inside = (selector: string) => element.closest?.(selector) !== null;
  if (inside(places.composer)) {
    return 'composer';
  }
  if (inside(places.conversation)) {
    return 'message';
  }
  return inside(places.chatList) ? 'chat' : 'other';
}

const TARGETS: ReadonlySet<unknown> = new Set<ClickTarget>([
  'composer',
  'message',
  'chat',
  'other',
]);

/** The probe's answer, or `other` for anything the page made of it. */
export function parseClickTarget(value: unknown): ClickTarget {
  return TARGETS.has(value) ? (value as ClickTarget) : 'other';
}

/**
 * The probe as code for `executeJavaScriptInIsolatedWorld`, at a point in
 * the page's CSS pixels. Only finite numbers reach the code.
 */
export function clickTargetProbe(x: number, y: number): string {
  const places: Places = {
    composer: LANDMARKS.composer,
    conversation: LANDMARKS.conversation,
    chatList: LANDMARKS.chatList,
  };
  const at = (value: number) => (Number.isFinite(value) ? value : -1);
  return `(${clickTarget.toString()})(document, ${String(at(x))}, ${String(at(y))}, ${JSON.stringify(places)})`;
}
