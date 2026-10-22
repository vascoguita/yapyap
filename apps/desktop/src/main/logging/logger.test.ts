import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.ts';

const HOME = '/home/maria';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const fresh = () => mkdtempSync(join(tmpdir(), 'yapyap-logs-'));

describe('createLogger', () => {
  it('writes timestamped, redacted lines and keeps the recent ones', () => {
    const dir = fresh();
    const logger = createLogger({ dir, home: HOME, now: () => NOW });
    logger.log('warn', 'Could not open /home/maria/x for maria@example.com');
    logger.log('error', 'Boom');
    expect(readFileSync(join(dir, 'yapyap.log'), 'utf8')).toBe(
      '2026-10-21T12:00:00.000Z warn Could not open ~/x for [email]\n' +
        '2026-10-21T12:00:00.000Z error Boom\n',
    );
    expect(logger.recent()).toEqual([
      '2026-10-21T12:00:00.000Z warn Could not open ~/x for [email]',
      '2026-10-21T12:00:00.000Z error Boom',
    ]);
  });

  it('mirrors every redacted line, such as to a terminal', () => {
    const lines: string[] = [];
    const logger = createLogger({
      dir: fresh(),
      home: HOME,
      now: () => NOW,
      mirror: (line) => lines.push(line),
    });
    logger.log('error', 'Failed for maria@example.com');
    expect(lines).toEqual(['2026-10-21T12:00:00.000Z error Failed for [email]']);
  });

  it('keeps only the last 50 lines in memory', () => {
    const logger = createLogger({ dir: fresh(), home: HOME, now: () => NOW });
    for (let n = 0; n < 60; n += 1) {
      logger.log('info', `line ${String(n)}`);
    }
    const recent = logger.recent();
    expect(recent).toHaveLength(50);
    expect(recent[0]).toMatch(/line 10$/);
  });

  it('rotates by size and keeps a bounded number of files', () => {
    const dir = fresh();
    const logger = createLogger({ dir, home: HOME, now: () => NOW, maxBytes: 60, maxFiles: 2 });
    for (let n = 0; n < 8; n += 1) {
      logger.log('info', `entry number ${String(n)}`);
    }
    expect(readdirSync(dir).sort()).toEqual(['yapyap.1.log', 'yapyap.2.log', 'yapyap.log']);
    expect(readFileSync(join(dir, 'yapyap.log'), 'utf8')).toMatch(/entry number 7\n$/);
    expect(readFileSync(join(dir, 'yapyap.1.log'), 'utf8')).toMatch(/entry number 5\n$/);
  });

  it('rotates as soon as the file reaches the size limit', () => {
    const dir = fresh();
    const line = '2026-10-21T12:00:00.000Z info x\n';
    const logger = createLogger({ dir, home: HOME, now: () => NOW, maxBytes: line.length });
    logger.log('info', 'x');
    expect(readdirSync(dir)).toEqual(['yapyap.log']);
    logger.log('info', 'x');
    expect(readdirSync(dir).sort()).toEqual(['yapyap.1.log', 'yapyap.log']);
  });

  it('starts a fresh file at every launch, keeping earlier sessions', () => {
    const dir = fresh();
    createLogger({ dir, home: HOME, now: () => NOW, maxFiles: 2 }).log('info', 'first run');
    createLogger({ dir, home: HOME, now: () => NOW, maxFiles: 2 }).log('info', 'second run');
    createLogger({ dir, home: HOME, now: () => NOW, maxFiles: 2 }).log('info', 'third run');
    createLogger({ dir, home: HOME, now: () => NOW, maxFiles: 2 }).log('info', 'fourth run');
    expect(readdirSync(dir).sort()).toEqual(['yapyap.1.log', 'yapyap.2.log', 'yapyap.log']);
    expect(readFileSync(join(dir, 'yapyap.log'), 'utf8')).toMatch(/fourth run\n$/);
    expect(readFileSync(join(dir, 'yapyap.1.log'), 'utf8')).toMatch(/third run\n$/);
    expect(readFileSync(join(dir, 'yapyap.2.log'), 'utf8')).toMatch(/second run\n$/);
  });

  it('deletes rotated files older than the age limit at start', () => {
    const dir = fresh();
    for (const name of ['yapyap.1.log', 'yapyap.2.log', 'notes.txt']) {
      writeFileSync(join(dir, name), 'x');
    }
    const old = (NOW - 15 * 86_400_000) / 1000;
    utimesSync(join(dir, 'yapyap.2.log'), old, old);
    utimesSync(join(dir, 'notes.txt'), old, old);
    createLogger({ dir, home: HOME, now: () => NOW });
    expect(readdirSync(dir).sort()).toEqual(['notes.txt', 'yapyap.1.log']);
  });

  it('keeps logging in memory when the folder cannot be written', () => {
    const blocker = join(fresh(), 'file');
    writeFileSync(blocker, 'not a folder');
    const logger = createLogger({ dir: join(blocker, 'logs'), home: HOME, now: () => NOW });
    logger.log('warn', 'still here');
    expect(logger.recent()).toEqual(['2026-10-21T12:00:00.000Z warn still here']);
  });

  it('stops writing, but keeps going, after a write fails', () => {
    const dir = fresh();
    const logger = createLogger({ dir, home: HOME, now: () => NOW });
    // Appending to a folder fails on every OS.
    mkdirSync(join(dir, 'yapyap.log'));
    expect(() => {
      logger.log('info', 'first');
      logger.log('info', 'second');
    }).not.toThrow();
    expect(logger.recent()).toHaveLength(2);
  });
});
