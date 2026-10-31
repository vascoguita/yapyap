import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BuiltInModel } from './catalog.ts';
import type { ModelStore } from './store.ts';

/**
 * How a download ended: the model is saved and verified, or why not. A
 * file that does not match its SHA-256 is deleted, never kept.
 */
export type DownloadOutcome = 'done' | 'download-failed' | 'disk-full' | 'damaged';

/** What a download needs: where pieces go, the page's `fetch`, and what stops it. */
export interface DownloadDependencies {
  readonly store: ModelStore;
  readonly fetch: typeof fetch;
  /** Stops the download, as when the user removes the model meanwhile. */
  readonly signal?: AbortSignal;
  /** Only for tests; {@link PIECE_BYTES} otherwise. */
  readonly pieceBytes?: number;
}

/**
 * Pieces of 32 MB: what YapYap quitting mid-download can cost, and what
 * the page holds in memory while it writes one.
 */
const PIECE_BYTES = 32 * 1024 * 1024;

/** A download that stopped, which resuming carries on. */
const FAILED: DownloadOutcome = 'download-failed';

const PARTIAL = 206;
const OK = 200;

/** Thrown when the storage quota is used up, which the browser names `QuotaExceededError`. */
const isDiskFull = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'QuotaExceededError';

/** A download under way: the hash of what came so far, and the piece being filled. */
interface Progress {
  readonly hash: ReturnType<typeof sha256.create>;
  done: number;
  index: number;
  parts: Uint8Array<ArrayBuffer>[];
  filled: number;
}

/**
 * Hashes the pieces already saved, read back from disk: the hash of a
 * gigabyte cannot be kept across a restart, and reading it again takes
 * seconds.
 */
async function resumed(pieces: readonly Blob[]): Promise<Progress> {
  const hash = sha256.create();
  const saved = new Blob([...pieces]);
  for await (const chunk of saved.stream()) {
    hash.update(chunk);
  }
  return { hash, done: saved.size, index: pieces.length, parts: [], filled: 0 };
}

async function flush(store: ModelStore, model: BuiltInModel, progress: Progress): Promise<void> {
  if (progress.filled === 0) {
    return;
  }
  await store.save(model.sha256, progress.index, progress.parts);
  progress.index += 1;
  progress.parts = [];
  progress.filled = 0;
}

/** Reads the body into pieces, hashing as it goes; false when it ran past the model's size. */
async function pour(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  model: BuiltInModel,
  progress: Progress,
  deps: DownloadDependencies & { readonly onProgress: (done: number) => void },
): Promise<boolean> {
  for await (const chunk of body) {
    progress.hash.update(chunk);
    progress.parts.push(chunk);
    progress.filled += chunk.byteLength;
    progress.done += chunk.byteLength;
    if (progress.done > model.size) {
      return false;
    }
    if (progress.filled >= (deps.pieceBytes ?? PIECE_BYTES)) {
      await flush(deps.store, model, progress);
    }
    deps.onProgress(progress.done);
  }
  return true;
}

/**
 * {@link pour}, saving what came even when the connection breaks, so
 * resuming asks only for the rest.
 */
async function receive(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  model: BuiltInModel,
  progress: Progress,
  deps: DownloadDependencies & { readonly onProgress: (done: number) => void },
): Promise<boolean> {
  let fits: boolean;
  try {
    fits = await pour(body, model, progress, deps);
  } catch (error) {
    await flush(deps.store, model, progress);
    throw error;
  }
  if (fits) {
    await flush(deps.store, model, progress);
  }
  return fits;
}

/** Asks for the file from byte `start` on, sending no cookies. */
const fetchFrom = (model: BuiltInModel, start: number, deps: DownloadDependencies) =>
  deps.fetch(model.url, {
    headers: start > 0 ? { Range: `bytes=${String(start)}-` } : {},
    signal: deps.signal ?? null,
    credentials: 'omit',
  });

/**
 * The rest of the file, from where the saved pieces end, with an HTTP
 * `Range` request; or the whole file when nothing is saved yet or the
 * server ignored the range, which starts over.
 */
async function request(
  model: BuiltInModel,
  progress: Progress,
  deps: DownloadDependencies,
): Promise<{ body: ReadableStream<Uint8Array<ArrayBuffer>>; progress: Progress } | undefined> {
  const resuming = progress.done > 0;
  const response = await fetchFrom(model, progress.done, deps);
  const expected = response.status === OK || (resuming && response.status === PARTIAL);
  if (!expected || response.body === null) {
    return undefined;
  }
  if (resuming && response.status === OK) {
    await deps.store.clear(model.sha256);
    return { body: response.body, progress: await resumed([]) };
  }
  return { body: response.body, progress };
}

/** Whether the saved file is the pinned one; a file that is not is deleted. */
async function verified(
  model: BuiltInModel,
  progress: Progress,
  store: ModelStore,
): Promise<boolean> {
  const matches =
    progress.done === model.size && bytesToHex(progress.hash.digest()) === model.sha256;
  if (!matches) {
    await store.clear(model.sha256);
  }
  return matches;
}

async function fetched(
  model: BuiltInModel,
  saved: Progress,
  deps: DownloadDependencies & { readonly onProgress: (done: number) => void },
): Promise<DownloadOutcome> {
  if (saved.done < model.size) {
    const answer = await request(model, saved, deps);
    if (answer === undefined) {
      return FAILED;
    }
    if (!(await receive(answer.body, model, answer.progress, deps))) {
      await deps.store.clear(model.sha256);
      return 'damaged';
    }
    // A stream that ends early is a broken connection, which resuming mends.
    if (answer.progress.done < model.size) {
      return FAILED;
    }
    return (await verified(model, answer.progress, deps.store)) ? 'done' : 'damaged';
  }
  return (await verified(model, saved, deps.store)) ? 'done' : 'damaged';
}

/**
 * Downloads `model` into the store, or resumes what an earlier download
 * left, and checks it against its SHA-256 as it streams in. It runs only
 * on the user's click, and first checks there is room for the rest.
 */
export async function download(
  model: BuiltInModel,
  deps: DownloadDependencies,
  onProgress: (done: number) => void,
): Promise<DownloadOutcome> {
  try {
    const saved = await resumed(await deps.store.pieces(model.sha256));
    onProgress(saved.done);
    const free = await deps.store.free();
    if (free !== undefined && free < model.size - saved.done) {
      return 'disk-full';
    }
    return await fetched(model, saved, { ...deps, onProgress });
  } catch (error) {
    return isDiskFull(error) ? 'disk-full' : FAILED;
  }
}

/** How much of `model` is saved, for the progress shown after a restart. */
export async function savedBytes(model: BuiltInModel, store: ModelStore): Promise<number> {
  const pieces = await store.pieces(model.sha256);
  return pieces.reduce((total, piece) => total + piece.size, 0);
}

/** The saved model as one file, which the engine reads piece by piece without copying it. */
export async function savedModel(model: BuiltInModel, store: ModelStore): Promise<Blob> {
  return new Blob(await store.pieces(model.sha256));
}
