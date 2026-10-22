import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CrashFiles } from './crash-reports.ts';

/** The logger rotates at startup, so the previous session's last file is this one. */
const PREVIOUS_LOG = 'yapyap.1.log';

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export function profileCrashFiles(dir: string): CrashFiles {
  return {
    read: (name) => readText(join(dir, name)),
    write: (name, text) => {
      writeFileSync(join(dir, name), text);
    },
    remove: (name) => {
      rmSync(join(dir, name), { force: true });
    },
  };
}

/** The previous session's log lines, which the logger redacted as it wrote them. */
export function readPreviousLog(logDir: string): string[] {
  return (readText(join(logDir, PREVIOUS_LOG)) ?? '').split('\n').filter((line) => line !== '');
}
