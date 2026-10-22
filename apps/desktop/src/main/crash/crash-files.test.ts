import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileCrashFiles, readPreviousLog } from './crash-files.ts';

function fresh(): string {
  return mkdtempSync(join(tmpdir(), 'yapyap-crash-'));
}

describe('profileCrashFiles', () => {
  it('writes, reads and removes files in the profile folder', () => {
    const files = profileCrashFiles(fresh());
    expect(files.read('running.json')).toBeUndefined();
    files.write('running.json', '{}');
    expect(files.read('running.json')).toBe('{}');
    files.remove('running.json');
    expect(files.read('running.json')).toBeUndefined();
    expect(() => {
      files.remove('running.json');
    }).not.toThrow();
  });

  it('throws when it cannot write, for the caller to log', () => {
    expect(() => {
      profileCrashFiles(join(fresh(), 'missing')).write('running.json', '{}');
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
