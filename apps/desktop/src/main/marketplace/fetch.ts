import type { Fetcher } from './index-client.ts';

/** What the marketplace needs of a response: its status, and its body as a stream. */
export interface StreamedResponse {
  readonly ok: boolean;
  readonly body: ReadableStream<Uint8Array> | null;
}

/** Joins the chunks read so far into one buffer. */
function joined(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Reads a body, giving up as soon as it passes `limit` bytes; leaving the
 * loop early cancels the rest of the download.
 */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | undefined> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.length;
    if (length > limit) {
      return undefined;
    }
    chunks.push(chunk);
  }
  return joined(chunks, length);
}

/**
 * Downloads files for the marketplace (ADR 0014): a plain request that
 * stops reading past `limit` bytes, so a broken or hostile server cannot
 * fill memory, and treats any failure as nothing downloaded.
 */
export function cappedFetcher(
  request: (url: string) => Promise<StreamedResponse>,
  limit: number,
): Fetcher {
  return async (url) => {
    try {
      const response = await request(url);
      return response.ok && response.body !== null
        ? await readCapped(response.body, limit)
        : undefined;
    } catch {
      return undefined;
    }
  };
}

/** A response to a check for an unreviewed extension's latest archive. */
export interface LatestResponse extends StreamedResponse {
  readonly headers: { get: (name: string) => string | null };
}

/**
 * What identifies the file a latest address serves now. YapYap compares these
 * on this computer and never sends them back, as conditional requests would,
 * since a server could make each user's unique and recognize them by it.
 */
export interface Validators {
  readonly etag: string | null;
  readonly lastModified: string | null;
}

/** A downloaded latest archive, with what identifies it when the server said. */
export interface LatestDownload {
  readonly bytes: Uint8Array;
  readonly validators?: Validators;
}

/** Downloads an unreviewed extension's latest archive, or asks only what identifies it. */
export interface LatestFetcher {
  /** What a `HEAD` request says identifies the file now; undefined when it says nothing. */
  readonly head: (url: string) => Promise<Validators | undefined>;
  readonly download: (url: string) => Promise<LatestDownload | undefined>;
}

/** Longer validators are no use for comparing, and would only grow the file they are kept in. */
const MAX_VALIDATOR = 200;

function header(response: LatestResponse, name: string): string | null {
  const value = response.headers.get(name);
  return value !== null && value.length <= MAX_VALIDATOR ? value : null;
}

function validatorsOf(response: LatestResponse): Validators | undefined {
  const etag = header(response, 'etag');
  const lastModified = header(response, 'last-modified');
  return etag === null && lastModified === null ? undefined : { etag, lastModified };
}

/**
 * Downloads files for unreviewed extensions (ADR 0014): plain requests, read
 * up to `limit` bytes. Any failure counts as nothing downloaded.
 */
export function latestFetcher(
  request: (url: string, method: 'GET' | 'HEAD') => Promise<LatestResponse>,
  limit: number,
): LatestFetcher {
  const answer = async (url: string, method: 'GET' | 'HEAD') => {
    const response = await request(url, method);
    return response.ok ? response : undefined;
  };
  return {
    head: async (url) => {
      const response = await answer(url, 'HEAD').catch(() => undefined);
      return response === undefined ? undefined : validatorsOf(response);
    },
    download: async (url) => {
      try {
        const response = await answer(url, 'GET');
        if (response === undefined || response.body === null) {
          return undefined;
        }
        const bytes = await readCapped(response.body, limit);
        if (bytes === undefined) {
          return undefined;
        }
        const validators = validatorsOf(response);
        return validators === undefined ? { bytes } : { bytes, validators };
      } catch {
        return undefined;
      }
    },
  };
}

/** The part of a session's `webRequest` that can refuse a request before it is sent. */
export interface RequestFilter {
  onBeforeRequest: (
    listener: (
      details: { readonly url: string },
      callback: (response: { readonly cancel: boolean }) => void,
    ) => void,
  ) => void;
}

/**
 * Refuses every request of the marketplace's session that `secure` does not
 * accept, each redirect included, so neither YapYap's host nor an author's
 * server can move a download to plain HTTP (ADR 0014).
 */
function refuseInsecure(webRequest: RequestFilter, secure: (url: string) => boolean): void {
  webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !secure(details.url) });
  });
}

/**
 * The marketplace's session, made on first use, once the app is ready, and
 * refusing from its first request what `secure` does not accept.
 */
export function guardedSession<T extends { readonly webRequest: RequestFilter }>(
  open: () => T,
  secure: (url: string) => boolean,
): () => T {
  let made: T | undefined;
  return () => {
    if (made === undefined) {
      made = open();
      refuseInsecure(made.webRequest, secure);
    }
    return made;
  };
}
