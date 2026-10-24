import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileCrashFiles, readPreviousLog } from './crash-files.ts';

function fresh(): string {
  return mkdtempSync(join(tmpdir(), 'yapyap-crash-'));
}

describe('profileCrashFiles', () => {
  it('writes, reads and removes files in the profile folder', () => {
    const files = profileCrashFiles(fresh(), fresh());
    expect(files.read('running.json')).toBeUndefined();
    files.write('running.json', '{}');
    expect(files.read('running.json')).toBe('{}');
    files.remove('running.json');
    expect(files.read('running.json')).toBeUndefined();
    expect(() => {
      files.remove('running.json');
    }).not.toThrow();
  });

  it('says when a file was last written', () => {
    const files = profileCrashFiles(fresh(), fresh());
    expect(files.modifiedAt('crash-report.txt')).toBeUndefined();
    files.write('crash-report.txt', 'report');
    expect(files.modifiedAt('crash-report.txt')).toBeGreaterThan(0);
  });

  it('removes every memory dump below the dumps folder, and nothing else', () => {
    const dumps = fresh();
    mkdirSync(join(dumps, 'completed'));
    mkdirSync(join(dumps, 'pending'));
    writeFileSync(join(dumps, 'completed', 'a.dmp'), 'x');
    writeFileSync(join(dumps, 'pending', 'b.dmp'), 'x');
    writeFileSync(join(dumps, 'settings.dat'), 'x');
    const files = profileCrashFiles(fresh(), dumps);
    expect(files.clearDumps()).toBe(2);
    expect(readdirSync(dumps, { recursive: true }).sort()).toEqual([
      'completed',
      'pending',
      'settings.dat',
    ]);
    expect(profileCrashFiles(fresh(), join(dumps, 'missing')).clearDumps()).toBe(0);
  });

  it('throws when it cannot write, for the caller to log', () => {
    expect(() => {
      profileCrashFiles(join(fresh(), 'missing'), fresh()).write('running.json', '{}');
    }).toThrow();
  });
});

describe('readPreviousLog', () => {
  it('reads the previous session’s log lines', () => {
    const dir = fresh();
    writeFileSync(join(dir, 'yapyap.1.log'), 'one\ntwo\n\n');
    writeFileSync(join(dir, 'yapyap.log'), 'current');
    expect(readPreviousLog(dir)).toEqual(['one', 'two']);
  });

  it('is empty without a previous log', () => {
    const dir = fresh();
    mkdirSync(join(dir, 'logs'));
    expect(readPreviousLog(join(dir, 'logs'))).toEqual([]);
  });
});
