import { join } from 'node:path';

/** What YapYap kept for the private model it no longer has (#627): its downloads, and its record. */
const LEFTOVERS = ['models', 'assistant.json'] as const;

/**
 * Deletes the private model's files from the profile, which can take a
 * gigabyte or more, so nothing of it stays behind on the user's disk.
 * Each is removed once and is gone after; a failure only means it waits
 * for the next start.
 */
export async function removeLeftovers(
  userData: string,
  remove: (path: string, options: { recursive: true; force: true }) => Promise<void>,
  warn: (message: string) => void,
): Promise<void> {
  for (const name of LEFTOVERS) {
    await remove(join(userData, name), { recursive: true, force: true }).catch(() => {
      warn(`Could not remove the old ${name} from the profile.`);
    });
  }
}
