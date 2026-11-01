import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrivateModel } from './catalog.ts';

/** Adds to a partial download. */
export interface ModelWriter {
  readonly write: (chunk: Uint8Array) => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Where the private model lives on disk: `<userData>/models/`, named by
 * its SHA-256, as `<sha256>.gguf.part` while it downloads and
 * `<sha256>.gguf` once it matched its hash. Nothing else in YapYap writes there.
 */
export interface ModelFiles {
  /** The verified model's file, which the engine page reads. */
  readonly path: (model: PrivateModel) => string;
  /** Bytes of the partial download saved so far; 0 when there is none. */
  readonly saved: (model: PrivateModel) => Promise<number>;
  /** The partial download's bytes, to hash them again after a restart. */
  readonly read: (model: PrivateModel) => AsyncIterable<Uint8Array>;
  /** Opens the partial download to add to; `fresh` starts it over. */
  readonly append: (model: PrivateModel, fresh: boolean) => Promise<ModelWriter>;
  /** Makes the verified partial download the model's file. */
  readonly finish: (model: PrivateModel) => Promise<void>;
  /** Deletes the partial download. */
  readonly discard: (model: PrivateModel) => Promise<void>;
  /** Deletes every model, downloaded or partial. */
  readonly clear: () => Promise<void>;
  /** Bytes all models take. */
  readonly used: () => Promise<number>;
  /** Bytes free on the disk the models are on, or undefined when the system does not say. */
  readonly free: () => Promise<number | undefined>;
}

/** Read and write for the user alone: nobody else needs the model. */
const OWNER_ONLY = 0o600;
const OWNER_ONLY_FOLDER = 0o700;

const sizeOf = async (path: string): Promise<number> => {
  try {
    const info = await stat(path);
    return info.size;
  } catch {
    return 0;
  }
};

/** The model files in `folder`. */
export function diskModelFiles(folder: string): ModelFiles {
  const named = (model: PrivateModel, suffix = '') => join(folder, `${model.sha256}.gguf${suffix}`);
  const partial = (model: PrivateModel) => named(model, '.part');
  return {
    path: (model) => named(model),
    saved: (model) => sizeOf(partial(model)),
    async *read(model) {
      if ((await sizeOf(partial(model))) > 0) {
        yield* createReadStream(partial(model));
      }
    },
    append: async (model, fresh) => {
      await mkdir(folder, { recursive: true, mode: OWNER_ONLY_FOLDER });
      const file = await open(partial(model), fresh ? 'w' : 'a', OWNER_ONLY);
      return {
        write: async (chunk) => {
          await file.write(chunk);
        },
        close: () => file.close(),
      };
    },
    finish: (model) => rename(partial(model), named(model)),
    discard: (model) => rm(partial(model), { force: true }),
    clear: () => rm(folder, { recursive: true, force: true }),
    used: async () => {
      const names = await readdir(folder).catch(() => []);
      const sizes = await Promise.all(names.map((name) => sizeOf(join(folder, name))));
      return sizes.reduce((total, size) => total + size, 0);
    },
    free: async () => {
      try {
        await mkdir(folder, { recursive: true, mode: OWNER_ONLY_FOLDER });
        const { bavail, bsize } = await statfs(folder);
        return bavail * bsize;
      } catch {
        return undefined;
      }
    },
  };
}
