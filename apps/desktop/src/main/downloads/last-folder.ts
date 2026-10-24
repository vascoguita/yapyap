/** A small state file; window-state.json and the like keep state out of the settings too. */
export interface StateFile {
  readonly read: () => string | undefined;
  readonly write: (text: string) => void;
}

export interface LastFolder {
  readonly get: () => string | undefined;
  readonly set: (folder: string) => void;
}

/** Where the user last saved a download they were asked about (#74). */
export function lastFolderIn(file: StateFile): LastFolder {
  let folder: string | undefined;
  try {
    const parsed = JSON.parse(file.read() ?? '{}') as { lastFolder?: unknown };
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
