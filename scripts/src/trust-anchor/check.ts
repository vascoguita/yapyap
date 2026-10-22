/** PEM text without line-ending or edge whitespace differences. */
function normalize(pem: string): string {
  return pem.replaceAll('\r\n', '\n').trim();
}

export type AnchorCheck = 'match' | 'mismatch' | 'no-variable';

/**
 * Compares the repository's PLUGIN_SIGNING_PUBLIC_KEY with the first trust
 * anchor YapYap embeds, so CI signs first-party plugins only with a key the
 * app accepts (ADR 0004). Forks get no variables, so there is nothing to check.
 */
export function checkTrustAnchor(variable: string, anchors: readonly string[]): AnchorCheck {
  if (variable.trim() === '') {
    return 'no-variable';
  }
  return normalize(variable) === normalize(anchors[0] ?? '') ? 'match' : 'mismatch';
}
