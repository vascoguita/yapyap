import { LANDMARKS } from './page-state.ts';

interface FocusableDocument {
  querySelector(selectors: string): unknown;
}

/**
 * Focuses the open conversation's message box, so a reply typed in a
 * notification lands there (#60). Runs inside the page as source text, so it
 * must stay self-contained. It reads nothing and reports only whether it
 * found the box.
 */
export function focusComposer(doc: FocusableDocument, selector: string): boolean {
  const box = doc.querySelector(selector) as { focus?: () => void } | null;
  if (typeof box?.focus !== 'function') {
    return false;
  }
  box.focus();
  return true;
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const FOCUS_COMPOSER = `(${focusComposer.toString()})(document, ${JSON.stringify(LANDMARKS.composer)})`;

/** Longer than any message WhatsApp lets one type. */
const MAX_DRAFT = 65_536;

interface DraftBox {
  readonly textContent: string | null;
  readonly innerText?: string;
}

/**
 * What the user typed in the open chat's message box so far, or null when
 * no chat is open. Like the chat reader, it returns page text, so it runs
 * only when the assistant asks, and nothing logs it. It runs inside the
 * page as source text, so it must stay self-contained.
 */
export function readComposer(doc: FocusableDocument, selector: string, max: number): unknown {
  const box = doc.querySelector(selector) as DraftBox | null;
  if (box === null) {
    return null;
  }
  return (box.innerText ?? box.textContent ?? '').trimEnd().slice(0, max);
}

/** The reader as code for `executeJavaScriptInIsolatedWorld`. */
export const READ_COMPOSER = `(${readComposer.toString()})(document, ${JSON.stringify(LANDMARKS.composer)}, ${String(MAX_DRAFT)})`;

/** The reader's answer, or undefined for anything else the page made of it. */
export function parseDraft(value: unknown): string | null | undefined {
  return value === null || (typeof value === 'string' && value.length <= MAX_DRAFT)
    ? value
    : undefined;
}

interface SelectableDocument extends FocusableDocument {
  getSelection(): { selectAllChildren(node: never): void } | null;
}

/**
 * Focuses the open conversation's message box and selects everything in it,
 * so the text typed next replaces the draft (#330). WhatsApp's editor puts
 * back its own caret when the box takes the focus, which would undo a
 * selection made at once and leave the new text added after the draft
 * (#609), so it selects a moment later, once the editor has done so. Runs
 * as source text, so it stays self-contained; it reports only whether it
 * found the box.
 */
export function selectComposer(
  doc: SelectableDocument,
  scope: Record<string, unknown>,
  selector: string,
  settleMs: number,
): Promise<boolean> {
  const box = doc.querySelector(selector) as { focus?: () => void } | null;
  if (typeof box?.focus !== 'function') {
    return Promise.resolve(false);
  }
  box.focus();
  const later = scope['setTimeout'] as (run: () => void, ms: number) => unknown;
  return new Promise((done) => {
    later.call(
      scope,
      () => {
        doc.getSelection()?.selectAllChildren(box as never);
        done(true);
      },
      settleMs,
    );
  });
}

/** How long the editor takes to settle once focused, with room to spare; a frame or two. */
const SETTLE_MS = 30;

/** The selecting probe as code for `executeJavaScriptInIsolatedWorld`. */
export const SELECT_COMPOSER = `(${selectComposer.toString()})(document, globalThis, ${JSON.stringify(LANDMARKS.composer)}, ${String(SETTLE_MS)})`;
