import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { redact } from './redact.ts';

type Level = 'info' | 'warn' | 'error';

export interface LogOptions {
  readonly dir: string;
  readonly home: string;
  readonly now: () => number;
  /** Rotate once the current file passes this size. */
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

/** Each rename replaces its target, so the oldest file drops off the end. */
function rotate(dir: string, maxFiles: number): void {
  for (let n = maxFiles - 1; n >= 1; n -= 1) {
    if (existsSync(join(dir, rotated(n))))
      renameSync(join(dir, rotated(n)), join(dir, rotated(n + 1)));
  }
  renameSync(join(dir, FILE), join(dir, rotated(1)));
}

function pruneOld(dir: string, now: number, maxAgeMs: number): void {
  for (const name of readdirSync(dir)) {
    if (!/^yapyap\.\d+\.log$/.test(name)) continue;
    if (now - statSync(join(dir, name)).mtimeMs > maxAgeMs) unlinkSync(join(dir, name));
  }
}

function prepare(dir: string, now: number, maxAgeMs: number): void {
  try {
    mkdirSync(dir, { recursive: true });
    pruneOld(dir, now, maxAgeMs);
  } catch {
    // An unwritable folder only costs the log file; lines stay in memory.
  }
}

function append(dir: string, line: string, maxBytes: number, maxFiles: number): void {
  try {
    const file = join(dir, FILE);
    if (existsSync(file) && statSync(file).size >= maxBytes) rotate(dir, maxFiles);
    appendFileSync(file, `${line}\n`);
  } catch {
    // A full or read-only disk must not take the app down with it.
  }
}

/**
 * Writes redacted, timestamped lines to `dir`, rotating by size and dropping
 * old files by age. Logging never throws.
 */
export function createLogger(options: LogOptions): Logger {
  const { dir, home, now, maxBytes = 1_000_000, maxFiles = 5, maxAgeMs = 14 * DAY_MS } = options;
  const recent: string[] = [];
  prepare(dir, now(), maxAgeMs);
  return {
    log: (level, message) => {
      const line = `${new Date(now()).toISOString()} ${level} ${redact(message, home)}`;
      recent.push(line);
      if (recent.length > RECENT_LINES) recent.shift();
      append(dir, line, maxBytes, maxFiles);
    },
    recent: () => [...recent],
  };
}
