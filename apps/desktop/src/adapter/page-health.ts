export interface PageHealth {
  readonly unsupported: boolean;
  readonly blank: boolean;
}

interface ProbedDocument {
  readonly body: {
    readonly innerText: string;
    querySelectorAll(selectors: string): { readonly length: number };
  } | null;
}

/**
 * Runs inside the page, so it must stay self-contained: it is sent as source
 * text. It returns only two booleans; page text, which can contain chats,
 * never leaves the page.
 */
export function probePageHealth(doc: ProbedDocument): PageHealth {
  // Declared in here: the probe runs as serialized code in another world.
  /** html, head and body: a document with nothing in it. */
  const BARE_DOCUMENT_ELEMENTS = 3;
  const text = doc.body === null ? '' : doc.body.innerText.trim();
  const elements = doc.body === null ? 0 : doc.body.querySelectorAll('*').length;
  // WhatsApp's "update your browser" page names Chrome and asks for an update.
  const unsupported =
    /WhatsApp works with|update (?:google )?chrome|browser (?:is )?(?:not|no longer) supported/i.test(
      text,
    );
  return { unsupported, blank: text === '' && elements < BARE_DOCUMENT_ELEMENTS };
}

/** The probe as code for `executeJavaScriptInIsolatedWorld`. */
export const PAGE_HEALTH_PROBE = `(${probePageHealth.toString()})(document)`;

/** Accepts only the exact shape the probe returns. */
export function parsePageHealth(value: unknown): PageHealth | undefined {
  const { unsupported, blank } = Object(value) as Record<string, unknown>;
  return typeof unsupported === 'boolean' && typeof blank === 'boolean'
    ? { unsupported, blank }
    : undefined;
}
