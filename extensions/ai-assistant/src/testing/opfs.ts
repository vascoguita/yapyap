/** A folder of the origin private file system, kept in memory for tests. */
interface Folder {
  readonly kind: 'directory';
  readonly name: string;
  readonly entries: Map<string, Folder | Bytes>;
}

interface Bytes {
  readonly kind: 'file';
  readonly name: string;
  data: Blob;
}

/** How many bytes are left to fill. */
interface Quota {
  left: number;
}

const missing = (name: string): DOMException =>
  new DOMException(`${name} was not found.`, 'NotFoundError');

function fileHandle(file: Bytes, quota: Quota) {
  return {
    kind: 'file' as const,
    name: file.name,
    getFile: () => Promise.resolve(new File([file.data], file.name)),
    // Like the browser's, a write lands only once the stream closes.
    createWritable: () => {
      let pending = new Blob([]);
      return Promise.resolve({
        write: (data: Blob) => {
          pending = data;
          return Promise.resolve();
        },
        close: () => {
          if (pending.size > quota.left) {
            return Promise.reject(new DOMException('Full.', 'QuotaExceededError'));
          }
          quota.left -= pending.size;
          file.data = pending;
          return Promise.resolve();
        },
      });
    },
  };
}

/** The entry `name` in `folder`, made by `make` when `create` allows; a missing one rejects. */
function child<T extends Folder | Bytes>(
  folder: Folder,
  name: string,
  create: boolean,
  make: () => T,
): Promise<T> {
  const found = folder.entries.get(name) ?? (create ? make() : undefined);
  if (found === undefined) {
    return Promise.reject(missing(name));
  }
  folder.entries.set(name, found);
  return Promise.resolve(found as T);
}

function folderHandle(folder: Folder, quota: Quota): FileSystemDirectoryHandle {
  const handle = (entry: Folder | Bytes) =>
    entry.kind === 'file' ? fileHandle(entry, quota) : folderHandle(entry, quota);
  const newFolder = (name: string): Folder => ({ kind: 'directory', entries: new Map(), name });
  const newFile = (name: string): Bytes => ({ kind: 'file', data: new Blob([]), name });
  return {
    kind: 'directory',
    name: folder.name,
    getDirectoryHandle: async (name: string, options: { create: boolean }) =>
      folderHandle(await child(folder, name, options.create, () => newFolder(name)), quota),
    getFileHandle: async (name: string, options: { create: boolean }) =>
      fileHandle(await child(folder, name, options.create, () => newFile(name)), quota),
    removeEntry: (name: string) =>
      folder.entries.delete(name) ? Promise.resolve() : Promise.reject(missing(name)),
    // An async iterator, as the browser's is, over what the folder holds now.
    values() {
      const entries = [...folder.entries.values()].map(handle);
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        next: () => {
          const value = entries.shift();
          return Promise.resolve(
            value === undefined ? { done: true, value } : { done: false, value },
          );
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

/** An origin private file system in memory, as the store reaches it. */
export interface MemoryFileSystem {
  readonly getDirectory: () => Promise<FileSystemDirectoryHandle>;
  readonly estimate: () => Promise<StorageEstimate>;
}

/** An origin private file system in memory, with `quota` bytes to fill; the browser names no quota for Infinity. */
export function memoryFileSystem(quota = Infinity): MemoryFileSystem {
  const root: Folder = { kind: 'directory', name: '', entries: new Map() };
  const left: Quota = { left: quota };
  return {
    getDirectory: () => Promise.resolve(folderHandle(root, left)),
    estimate: () => Promise.resolve(quota === Infinity ? {} : { quota, usage: quota - left.left }),
  };
}
