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

/** Reads a body, giving up as soon as it passes `limit` bytes. */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | undefined> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    length += read.value.length;
    if (length > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(read.value);
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
