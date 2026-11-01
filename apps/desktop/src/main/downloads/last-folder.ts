import type { TextFile } from '../atomic-write.ts';

export interface LastFolder {
  readonly get: () => string | undefined;
  readonly set: (folder: string) => void;
}

/** Where the user last saved a download they were asked about (#74). */
export function lastFolderIn(file: TextFile): LastFolder {
  let folder: string | undefined;
  try {
    const parsed = JSON.parse(file.read()) as { lastFolder?: unknown };
    folder = typeof parsed.lastFolder === 'string' ? parsed.lastFolder : undefined;
  } catch {
    folder = undefined;
  }
  return {
    get: () => folder,
    set: (next) => {
      folder = next;
      file.write(JSON.stringify({ lastFolder: next }));
    },
  };
}
