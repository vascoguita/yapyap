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
