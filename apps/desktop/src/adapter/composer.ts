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
 * only when a plugin holding `composer:read-draft` asks, and nothing logs
 * it. It runs inside the page as source text, so it must stay self-contained.
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
