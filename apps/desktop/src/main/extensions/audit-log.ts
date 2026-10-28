import { appendFileSync, readFileSync, renameSync, statSync } from 'node:fs';
import type { ExtensionErrorKind } from '@yapyap/extension-sdk';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

/** How a call ended: done, or the error kind the extension got. */
type AuditOutcome = 'ok' | ExtensionErrorKind;

/** One call an extension made, without its parameters or result (ADR 0004). */
interface AuditEntry {
  readonly time: string;
  readonly extension: string;
  readonly capability: string;
  readonly method: string;
  readonly outcome: AuditOutcome;
}

const EntrySchema = Type.Object(
  {
    time: Type.String({ maxLength: 40 }),
    extension: Type.String({ maxLength: 128 }),
    capability: Type.String({ maxLength: 64 }),
    method: Type.String({ maxLength: 64 }),
    outcome: Type.Union(
      ['ok', 'invalid', 'not-granted', 'rate-limited', 'timeout', 'failed'].map((kind) =>
        Type.Literal(kind),
      ),
    ),
  },
  { additionalProperties: false },
);

/** Room for thousands of calls; the file before that is kept once, as `.1`. */
export const MAX_LOG_BYTES = 256 * 1024;

/** How many calls the Extensions window shows. */
const RECENT = 50;

export interface AuditFile {
  readonly append: (text: string) => void;
  readonly read: () => string;
  readonly size: () => number;
  /** Moves the current file aside, replacing the one moved aside before. */
  readonly rotate: () => void;
}

/** The log at `path`, readable and writable by the user alone. */
export function auditFileAt(path: string): AuditFile {
  return {
    append: (text) => {
      appendFileSync(path, text, { mode: 0o600 });
    },
    read: () => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    },
    size: () => statSync(path, { throwIfNoEntry: false })?.size ?? 0,
    rotate: () => {
      renameSync(path, `${path}.1`);
    },
  };
}

export interface AuditLog {
  readonly record: (entry: Omit<AuditEntry, 'time'>) => void;
  /** The latest calls, newest first. */
  readonly recent: () => readonly AuditEntry[];
}

function parseLine(line: string): AuditEntry | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return Value.Check(EntrySchema, value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The extension activity log (#99): which capability each extension used, when,
 * and how it ended. Message content, parameters and results never reach it.
 */
export function createAuditLog(
  file: AuditFile,
  now: () => Date,
  warn: (message: string) => void,
): AuditLog {
  return {
    record: (entry) => {
      try {
        if (file.size() > MAX_LOG_BYTES) {
          file.rotate();
        }
        file.append(`${JSON.stringify({ time: now().toISOString(), ...entry })}\n`);
      } catch {
        warn('Could not write the extension activity log.');
      }
    },
    recent: () =>
      file
        .read()
        .split('\n')
        .map(parseLine)
        .filter((entry) => entry !== undefined)
        .slice(-RECENT)
        .reverse(),
  };
}
