import { basename, join } from 'node:path';
import { numberedName, safeFileName } from './file-name.ts';

export interface DownloadItem {
  getFilename(): string;
  setSavePath(path: string): void;
  once(event: 'done', listener: (event: unknown, state: string) => void): unknown;
}

export interface DownloadingSession {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItem) => void): unknown;
}

export interface DownloadDependencies {
  /** The downloads folder, resolved through any symlinks. */
  readonly folder: () => string;
  /** True when anything, including a dangling symlink, already has this path. */
  readonly taken: (path: string) => boolean;
  readonly notify: (message: string) => void;
  readonly warn: (message: string) => void;
}

/** Gives up numbering long before anyone has a hundred copies of one file. */
const MAX_COPIES = 99;

/**
 * Where a download goes: a sanitized name directly inside the real
 * downloads folder, numbered rather than ever replacing an existing entry,
 * so a symlink planted under the name cannot redirect the write.
 */
export function downloadTarget(
  suggested: string,
  deps: Pick<DownloadDependencies, 'folder' | 'taken'>,
): string | undefined {
  const folder = deps.folder();
  const name = safeFileName(suggested);
  for (let copy = 0; copy <= MAX_COPIES; copy += 1) {
    const path = join(folder, copy === 0 ? name : numberedName(name, copy));
    if (!deps.taken(path)) {
      return path;
    }
  }
  return undefined;
}

/** What to tell the user per final state; a cancel is the user's own doing. */
const REPORTS: ReadonlyMap<string, (name: string) => string> = new Map([
  ['completed', (name: string) => `Downloaded ${name} to your Downloads folder.`],
  ['interrupted', (name: string) => `Could not download ${name}.`],
]);

function report(deps: DownloadDependencies, name: string, state: string): void {
  const message = REPORTS.get(state);
  if (message !== undefined) {
    deps.notify(message(name));
  }
}

/** A file system that refuses to be checked means asking the user instead. */
function targetOrNothing(suggested: string, deps: DownloadDependencies): string | undefined {
  try {
    return downloadTarget(suggested, deps);
  } catch {
    return undefined;
  }
}

/**
 * Saves WhatsApp downloads straight into the downloads folder, as browsers
 * do, and says how each one ended. File names stay out of the log.
 */
export function guardDownloads(session: DownloadingSession, deps: DownloadDependencies): void {
  session.on('will-download', (_event, item) => {
    const target = targetOrNothing(item.getFilename(), deps);
    if (target === undefined) {
      deps.warn('Could not choose where to save a download; asking instead.');
      return;
    }
    item.setSavePath(target);
    item.once('done', (_done, state) => {
      report(deps, basename(target), state);
    });
  });
}
