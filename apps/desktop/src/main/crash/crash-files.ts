import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/** Crashpad's minidumps, wherever it keeps them below its folder. */
function removeDumps(dumps: string): number {
  let names: string[];
  try {
    names = readdirSync(dumps, { recursive: true, encoding: 'utf8' });
  } catch {
    return 0;
  }
  const found = names.filter((name) => name.endsWith('.dmp'));
  for (const name of found) {
    rmSync(join(dumps, name), { force: true });
  }
  return found.length;
}

/** Crash files in the profile folder `dir`, and Chromium's dumps under `dumps`. */
export function profileCrashFiles(dir: string, dumps: string): CrashFiles {
  return {
    read: (name) => readText(join(dir, name)),
    write: (name, text) => {
      writeFileSync(join(dir, name), text);
    },
    remove: (name) => {
      rmSync(join(dir, name), { force: true });
    },
    modifiedAt: (name) => statSync(join(dir, name), { throwIfNoEntry: false })?.mtimeMs,
    clearDumps: () => removeDumps(dumps),
  };
}

/** The previous session's log lines, which the logger redacted as it wrote them. */
export function readPreviousLog(logDir: string): string[] {
  return (readText(join(logDir, PREVIOUS_LOG)) ?? '').split('\n').filter((line) => line !== '');
}
