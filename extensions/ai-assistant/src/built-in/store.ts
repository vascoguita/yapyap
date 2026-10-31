/**
 * Where the model's weights are kept: the extension's own origin private
 * file system, on its persistent partition (`storage:local`), so nothing
 * else on the computer or in YapYap reads them.
 */
export interface ModelStore {
  /** The pieces of the model with `sha256` saved so far, in order. */
  readonly pieces: (sha256: string) => Promise<Blob[]>;
  /** Saves the next piece of the model with `sha256`, under its number. */
  readonly save: (
    sha256: string,
    index: number,
    parts: readonly Uint8Array<ArrayBuffer>[],
  ) => Promise<void>;
  /** Deletes the saved pieces of the model with `sha256`. */
  readonly clear: (sha256: string) => Promise<void>;
  /** Deletes every model. */
  readonly clearAll: () => Promise<void>;
  /** Bytes all models take. */
  readonly used: () => Promise<number>;
  /** Bytes still free for the extension, or undefined when the browser does not say. */
  readonly free: () => Promise<number | undefined>;
}

/** The parts of the browser's storage the store uses. */
export interface StorageAccess {
  readonly getDirectory: () => Promise<FileSystemDirectoryHandle>;
  readonly estimate: () => Promise<StorageEstimate>;
}

const FOLDER = 'models';

/** Digits in a piece's name, which sort as numbers do: far more pieces than any model has. */
const NAME_DIGITS = 6;

const pieceName = (index: number): string => String(index).padStart(NAME_DIGITS, '0');

/** Runs `step`, which finds nothing when an entry it looks for does not exist. */
async function unlessMissing<T>(step: () => Promise<T>): Promise<T | undefined> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return undefined;
    }
    throw error;
  }
}

/** Every file in `folder` and the folders inside it; none when there is no folder. */
async function filesIn(folder: FileSystemDirectoryHandle | undefined): Promise<File[]> {
  const files: File[] = [];
  for await (const entry of folder?.values() ?? []) {
    files.push(...(entry.kind === 'file' ? [await entry.getFile()] : await filesIn(entry)));
  }
  return files;
}

/** The folder of every model. */
async function modelsFolder(storage: StorageAccess, create: boolean) {
  const root = await storage.getDirectory();
  return root.getDirectoryHandle(FOLDER, { create });
}

/** The folder of the model with `sha256`. */
async function modelFolder(storage: StorageAccess, sha256: string, create: boolean) {
  const folder = await modelsFolder(storage, create);
  return folder.getDirectoryHandle(sha256, { create });
}

/**
 * The model store in the origin private file system. Each piece is a file
 * of its own, written in one go: a write only lands once its file closes,
 * so pieces make the download keep what it had when YapYap quits, without
 * copying what is already saved.
 */
export function browserStore(storage: StorageAccess): ModelStore {
  const models = (create = false) => modelsFolder(storage, create);
  const model = (sha256: string, create = false) => modelFolder(storage, sha256, create);
  return {
    pieces: async (sha256) => {
      const files = await filesIn(await unlessMissing(() => model(sha256)));
      return files.sort((a, b) => a.name.localeCompare(b.name));
    },
    save: async (sha256, index, parts) => {
      const folder = await model(sha256, true);
      const file = await folder.getFileHandle(pieceName(index), { create: true });
      const writable = await file.createWritable();
      await writable.write(new Blob([...parts]));
      await writable.close();
    },
    clear: async (sha256) => {
      await unlessMissing(async () => {
        const folder = await models();
        await folder.removeEntry(sha256, { recursive: true });
      });
    },
    clearAll: async () => {
      await unlessMissing(async () => {
        const root = await storage.getDirectory();
        await root.removeEntry(FOLDER, { recursive: true });
      });
    },
    used: async () => {
      const files = await filesIn(await unlessMissing(() => models()));
      return files.reduce((total, file) => total + file.size, 0);
    },
    free: async () => {
      const { quota, usage = 0 } = await storage.estimate();
      return quota === undefined ? undefined : quota - usage;
    },
  };
}
