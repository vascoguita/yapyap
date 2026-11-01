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

/** The user's confirmation of the consent warning, kept in a file of its own. */
export interface RecordingConsent {
  /** Whether the user confirmed this wording of the warning. */
  readonly confirmed: () => Promise<boolean>;
  /** Keeps the confirmation, given in YapYap's window by the call. */
  readonly confirm: () => void;
}

/**
 * The consent warning's confirmation (ADR 0015): asked before the first
 * recording, kept in `file` once given, and asked again when the warning
 * changes. Declining keeps nothing, so the user is asked next time.
 */
export function recordingConsent(file: string): RecordingConsent {
  return {
    confirmed: async () => (await confirmedVersion(file)) === CONSENT_VERSION,
    confirm: () => {
      writeTextAtomically(file, `${JSON.stringify({ version: CONSENT_VERSION })}\n`);
    },
  };
}
