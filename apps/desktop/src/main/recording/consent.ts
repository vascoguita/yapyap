import { readFile } from 'node:fs/promises';
import { writeTextAtomically } from '../atomic-write.ts';

/** Raised whenever the consent warning's wording changes, so the user confirms it again (ADR 0015). */
export const CONSENT_VERSION = 1;

async function confirmedVersion(file: string): Promise<number> {
  try {
    const { version } = JSON.parse(await readFile(file, 'utf8')) as { version?: unknown };
    return typeof version === 'number' ? version : 0;
  } catch {
    return 0;
  }
}

/**
 * Whether the user confirmed the consent warning: asked before the first
 * recording, kept in `file` once they confirm, and asked again when the
 * warning changes. Declining keeps nothing, so they are asked next time.
 */
export function recordingConsent(
  file: string,
  ask: () => Promise<boolean>,
): () => Promise<boolean> {
  return async () => {
    if ((await confirmedVersion(file)) === CONSENT_VERSION) {
      return true;
    }
    const confirmed = await ask();
    if (confirmed) {
      writeTextAtomically(file, `${JSON.stringify({ version: CONSENT_VERSION })}\n`);
    }
    return confirmed;
  };
}
