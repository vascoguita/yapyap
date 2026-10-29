import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CallRecording } from '@yapyap/extension-sdk';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { writeTextAtomically } from '../atomic-write.ts';
import type { RecordingSink } from './recorder.ts';

/** Recordings and their index hold other people's voices: readable by the user alone. */
const PRIVATE = 0o600;

const Entry = Type.Object(
  {
    id: Type.String({ pattern: '^[0-9a-f]{32}$' }),
    file: Type.String({ minLength: 1, maxLength: 4096 }),
    started: Type.String({ format: 'date-time' }),
    durationMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const Index = Type.Array(Entry, { maxItems: 10_000 });
type Entry = Static<typeof Entry>;

/** Where recordings go, and the index of what YapYap recorded there. */
export interface LibraryPaths {
  /** The folder recordings are saved in. */
  readonly folder: string;
  /** YapYap's own list of recordings, which extensions see only as IDs, dates and lengths. */
  readonly index: string;
}

const two = (value: number): string => String(value).padStart(2, '0');

/**
 * A recording's file name: only the local date and time it started, never
 * a contact's name, which is page text (ADR 0015).
 */
export function recordingName(started: Date): string {
  const day = `${String(started.getFullYear())}-${two(started.getMonth() + 1)}-${two(started.getDate())}`;
  return `YapYap call ${day} ${two(started.getHours())}.${two(started.getMinutes())}`;
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** A name in `folder` no file has yet: the plain one, or with ` (2)`, ` (3)` and so on. */
async function freeName(folder: string, base: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const name = attempt === 1 ? `${base}.webm` : `${base} (${String(attempt)}).webm`;
    if (!(await exists(join(folder, name)))) {
      return join(folder, name);
    }
  }
}

async function readIndex(path: string): Promise<Entry[]> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Value.Check(Index, value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * The sink a recording writes to: a `.part` file in the folder, renamed to
 * its date and time once the recording stops, or deleted if it fails, so a
 * half-written recording never passes for a finished one.
 */
export async function recordingSink(paths: LibraryPaths, started: Date): Promise<RecordingSink> {
  await mkdir(paths.folder, { recursive: true });
  const part = join(paths.folder, `.${randomBytes(8).toString('hex')}.part`);
  // Created at once, so a recording stopped before any sound still has a file,
  // which only the user can read: it holds other people's voices.
  await writeFile(part, new Uint8Array(), { flag: 'wx', mode: PRIVATE });
  return {
    write: (chunk) => appendFile(part, chunk),
    finish: async (durationMs) => {
      const file = await freeName(paths.folder, recordingName(started));
      await rename(part, file);
      const entry = {
        id: randomBytes(16).toString('hex'),
        started: started.toISOString(),
        file,
        durationMs,
      };
      const index = [...(await readIndex(paths.index)), entry];
      writeTextAtomically(paths.index, `${JSON.stringify(index, null, 2)}\n`, PRIVATE);
    },
    abort: () => rm(part, { force: true }),
  };
}

/** The recordings still on disk, newest first, as extensions may know them: no file names. */
export async function recordings(paths: LibraryPaths): Promise<CallRecording[]> {
  const index = await readIndex(paths.index);
  const kept = await Promise.all(
    index.map(async (entry) => ((await exists(entry.file)) ? [entry] : [])),
  );
  return kept
    .flat()
    .sort((a, b) => b.started.localeCompare(a.started))
    .map(({ id, started, durationMs }) => ({ id, started, durationMs }));
}

/** Shows a recording in the file manager; false when YapYap has no such recording on disk. */
export async function revealRecording(
  paths: LibraryPaths,
  id: string,
  show: (file: string) => void,
): Promise<boolean> {
  const index = await readIndex(paths.index);
  const entry = index.find((candidate) => candidate.id === id);
  if (entry === undefined || !(await exists(entry.file))) {
    return false;
  }
  show(entry.file);
  return true;
}
