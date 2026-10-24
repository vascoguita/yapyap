import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..');

/** Every TypeScript source file of the app, tests aside. */
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** What a local server or socket needs; YapYap's code has no use for any of it. */
const ENDPOINT = /createServer|\.listen\(|from 'node:(?:net|http|https|http2|dgram)'/;

describe('local endpoints', () => {
  // ADR 0004 and #94: nothing on this computer, a plugin included, can drive
  // YapYap from outside, because YapYap listens on no port or socket.
  it('are never opened by YapYap’s own code', () => {
    const files = sources(SOURCE);
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((file) => ENDPOINT.test(readFileSync(file, 'utf8')))).toEqual([]);
  });
});
