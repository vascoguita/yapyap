import { appendFileSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from './redact.ts';

type Level = 'info' | 'warn' | 'error';

export interface LogOptions {
  readonly dir: string;
  readonly home: string;
  readonly now: () => number;
  /** Rotate once this session has written this much to the current file. */
  readonly maxBytes?: number;
  /** Rotated files kept besides the current one. */
  readonly maxFiles?: number;
  /** Rotated files older than this are deleted at start. */
  readonly maxAgeMs?: number;
}

export interface Logger {
  readonly log: (level: Level, message: string) => void;
  /** The most recent lines, already redacted, for diagnostics. */
  readonly recent: () => readonly string[];
}

const FILE = 'yapyap.log';
const RECENT_LINES = 50;
const DAY_MS = 86_400_000;

const rotated = (n: number): string => `yapyap.${String(n)}.log`;

const PENDING = 'yapyap.rotating.log';

function shift(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    // Renaming instead of checking first leaves no gap for the file to change.
  }
}

/**
 * Moves the current file aside first, so a missing one means there is
 * nothing to rotate, then shifts the rest; each rename replaces its target,
 * so the oldest file drops off the end.
 */
function rotate(dir: string, maxFiles: number): void {
  try {
    renameSync(join(dir, FILE), join(dir, PENDING));
  } catch {
    return;
  }
  for (let n = maxFiles - 1; n >= 1; n -= 1) {
    shift(join(dir, rotated(n)), join(dir, rotated(n + 1)));
  }
  shift(join(dir, PENDING), join(dir, rotated(1)));
}

function pruneOld(dir: string, now: number, maxAgeMs: number): void {
  for (const name of readdirSync(dir)) {
    if (!/^yapyap\.\d+\.log$/.test(name)) {
      continue;
    }
    if (now - statSync(join(dir, name)).mtimeMs > maxAgeMs) {
      unlinkSync(join(dir, name));
    }
  }
}

/** Each launch starts a fresh file, so a bug report can point at one session. */
function prepare(dir: string, now: number, maxAgeMs: number, maxFiles: number): void {
  try {
    mkdirSync(dir, { recursive: true });
    pruneOld(dir, now, maxAgeMs);
    rotate(dir, maxFiles);
  } catch {
    // An unwritable folder only costs the log file; lines stay in memory.
  }
}

/**
 * Counts what it writes instead of asking the file system how big the file
 * is, so no check can race the write.
 */
function createWriter(dir: string, maxBytes: number, maxFiles: number): (line: string) => void {
  let written = 0;
  return (line) => {
    try {
      if (written >= maxBytes) {
        rotate(dir, maxFiles);
        written = 0;
      }
      const text = `${line}\n`;
      appendFileSync(join(dir, FILE), text);
      written += Buffer.byteLength(text);
    } catch {
      // A full or read-only disk must not take the app down with it.
    }
  };
}

/**
 * Writes redacted, timestamped lines to `dir`, rotating by size and dropping
 * old files by age. Logging never throws.
 */
export function createLogger(options: LogOptions): Logger {
  const { dir, home, now, maxBytes = 1_000_000, maxFiles = 5, maxAgeMs = 14 * DAY_MS } = options;
  const recent: string[] = [];
  prepare(dir, now(), maxAgeMs, maxFiles);
  const write = createWriter(dir, maxBytes, maxFiles);
  return {
    log: (level, message) => {
      const line = `${new Date(now()).toISOString()} ${level} ${redact(message, home)}`;
      recent.push(line);
      if (recent.length > RECENT_LINES) {
        recent.shift();
      }
      write(line);
    },
    recent: () => [...recent],
  };
}
