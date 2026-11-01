import { ARCHIVE_LIMITS } from '../../../packages/extension-sign/src/archive.ts';
import { checkedManifest } from './build.ts';
import { readEntry, type UnreviewedEntry } from './entries.ts';
import { publicGet, Refused, type PublicNetwork } from './public-fetch.ts';

/** What a third-party entry's latest address serves, as far as a pull request can tell. */
export type LatestCheck =
  /** An archive signed by the entry's key, for its ID, with a valid manifest. */
  | { readonly kind: 'verified'; readonly version: string }
  /** No answer, or a server error, even after retrying: maybe only for now. */
  | { readonly kind: 'unreachable'; readonly reason: string }
  /** A definite answer that is wrong: a client error, or an archive that fails a check. */
  | { readonly kind: 'invalid'; readonly reason: string };

/** Tries in all, so one dropped connection does not decide anything. */
const ATTEMPTS = 3;

/** HTTP statuses from 500 up are the server's own trouble, which may pass. */
const SERVER_ERROR = 500;

/**
 * Downloads the archive, no larger than YapYap would install, from the
 * public internet only. It tries again while the failure may pass: no
 * answer, or a server error; a refused address or answer is final.
 */
async function download(
  url: string,
  network: PublicNetwork,
  attemptsLeft = ATTEMPTS,
): Promise<Uint8Array | LatestCheck> {
  let reason: string;
  try {
    const { status, bytes } = await publicGet(url, network, ARCHIVE_LIMITS.archiveBytes);
    if (bytes !== undefined) {
      return bytes;
    }
    reason = `the latest address answered ${String(status)}.`;
    if (status < SERVER_ERROR) {
      return { kind: 'invalid', reason };
    }
  } catch (error) {
    if (error instanceof Refused) {
      return { kind: 'invalid', reason: error.message };
    }
    reason = 'the latest address could not be reached.';
  }
  return attemptsLeft > 1
    ? download(url, network, attemptsLeft - 1)
    : { kind: 'unreachable', reason };
}

/**
 * Checks what a third-party entry's latest address serves (ADR 0014): the
 * archive must unpack within the limits, be signed by the entry's key, and
 * carry a valid manifest with the entry's ID. Only the pull request that
 * adds or changes an entry runs this, so another author's server cannot
 * break unrelated pull requests.
 */
export async function checkLatest(
  entry: UnreviewedEntry,
  network: PublicNetwork,
): Promise<LatestCheck> {
  const bytes = await download(entry.latest, network);
  if (!(bytes instanceof Uint8Array)) {
    return bytes;
  }
  try {
    return { kind: 'verified', version: checkedManifest(bytes, entry.id, entry.signer).version };
  } catch (error) {
    return { kind: 'invalid', reason: (error as Error).message };
  }
}

/** One line for CI to show: a GitHub Actions annotation's level and text. */
export interface LatestReport {
  readonly level: 'notice' | 'warning' | 'error';
  readonly message: string;
}

/**
 * What CI reports for one entry file a pull request adds or changes: its
 * shape problems, or what its latest address serves. Official entries have
 * nothing to report here; `marketplace-index.ts` checks their archives.
 */
export async function reportLatest(
  json: unknown,
  file: string,
  network: PublicNetwork,
): Promise<LatestReport[]> {
  const entry = readEntry(json, file);
  if (Array.isArray(entry)) {
    return [{ level: 'error', message: `${file}: ${entry.join(' ')}` }];
  }
  if (entry.review === 'official') {
    return [];
  }
  const result = await checkLatest(entry, network);
  if (result.kind === 'verified') {
    const message = `${file}: the latest archive is ${entry.id} ${result.version}, signed by its key.`;
    return [{ level: 'notice', message }];
  }
  const level = result.kind === 'unreachable' ? 'warning' : 'error';
  return [{ level, message: `${file}: ${result.reason}` }];
}
