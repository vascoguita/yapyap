import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs';

/**
 * Writes `text` to a temporary file, flushes it to disk, then renames it
 * over `path`, so a crash or power cut leaves the old file or the new one,
 * never half of one.
 */
export function writeTextAtomically(path: string, text: string): void {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, 'w');
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}
