import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordingName,
  recordings,
  recordingsFolder,
  recordingSink,
  revealRecording,
  type LibraryPaths,
} from './library.ts';

let root: string;
let paths: LibraryPaths;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yapyap-recordings-'));
  paths = { folder: join(root, 'Calls'), index: join(root, 'recordings.json') };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const at = (hours: number, minutes: number) => new Date(2026, 9, 27, hours, minutes, 30);

describe('recordingsFolder', () => {
  it('uses the folder chosen in Settings while it is one, and the default otherwise', () => {
    const chosen = mkdtempSync(join(tmpdir(), 'yapyap-chosen-'));
    const file = join(chosen, 'not-a-folder');
    writeFileSync(file, '');
    const fallback = () => '/music/YapYap';
    try {
      expect(recordingsFolder('', fallback)).toBe('/music/YapYap');
      expect(recordingsFolder(chosen, fallback)).toBe(chosen);
      expect(recordingsFolder(file, fallback)).toBe('/music/YapYap');
      expect(recordingsFolder(join(chosen, 'gone'), fallback)).toBe('/music/YapYap');
    } finally {
      rmSync(chosen, { recursive: true, force: true });
    }
  });
});

describe('recordingName', () => {
  it('names a recording by its local date and time only', () => {
    expect(recordingName(at(9, 5))).toBe('YapYap call 2026-10-27 09.05');
    expect(recordingName(new Date(2026, 0, 3, 23, 59))).toBe('YapYap call 2026-01-03 23.59');
  });
});

describe('recordingSink', () => {
  it.skipIf(process.platform === 'win32')(
    'keeps the recording and the index readable by the user alone',
    async () => {
      const sink = await recordingSink(paths, at(14, 5));
      await sink.finish(1000);
      expect(statSync(paths.index).mode & 0o777).toBe(0o600);
      expect(statSync(join(paths.folder, 'YapYap call 2026-10-27 14.05.webm')).mode & 0o777).toBe(
        0o600,
      );
    },
  );

  it('writes to a hidden part file, then keeps it under its date, with its index', async () => {
    const sink = await recordingSink(paths, at(14, 5));
    await sink.write(new Uint8Array([1, 2]));
    await sink.write(new Uint8Array([3]));
    expect(readdirSync(paths.folder)).toEqual([expect.stringMatching(/^\.[0-9a-f]{16}\.part$/)]);
    await sink.finish(65_000);
    expect(readdirSync(paths.folder)).toEqual(['YapYap call 2026-10-27 14.05.webm']);
    expect(readFileSync(join(paths.folder, 'YapYap call 2026-10-27 14.05.webm'))).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(await recordings(paths)).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{32}$/) as string,
        started: at(14, 5).toISOString(),
        durationMs: 65_000,
      },
    ]);
  });

  it('never overwrites an earlier recording of the same minute', async () => {
    for (let count = 0; count < 3; count += 1) {
      const sink = await recordingSink(paths, at(14, 5));
      await sink.write(new Uint8Array([count]));
      await sink.finish(1000);
    }
    expect(readdirSync(paths.folder).sort()).toEqual([
      'YapYap call 2026-10-27 14.05 (2).webm',
      'YapYap call 2026-10-27 14.05 (3).webm',
      'YapYap call 2026-10-27 14.05.webm',
    ]);
  });

  it('deletes the part file of a recording that failed', async () => {
    const sink = await recordingSink(paths, at(14, 5));
    await sink.write(new Uint8Array([1]));
    await sink.abort();
    expect(readdirSync(paths.folder)).toEqual([]);
    expect(await recordings(paths)).toEqual([]);
  });
});

describe('recordings and revealRecording', () => {
  it('lists recordings newest first, leaving out deleted files and a broken index', async () => {
    for (const started of [at(9, 0), at(15, 0), at(12, 0)]) {
      const sink = await recordingSink(paths, started);
      await sink.finish(1000);
    }
    rmSync(join(paths.folder, 'YapYap call 2026-10-27 12.00.webm'));
    expect((await recordings(paths)).map(({ started }) => started)).toEqual([
      at(15, 0).toISOString(),
      at(9, 0).toISOString(),
    ]);
    writeFileSync(paths.index, '{');
    expect(await recordings(paths)).toEqual([]);
    writeFileSync(paths.index, JSON.stringify([{ id: 'x' }]));
    expect(await recordings(paths)).toEqual([]);
  });

  it('reveals only a recording it knows that is still on disk', async () => {
    const sink = await recordingSink(paths, at(9, 0));
    await sink.finish(1000);
    const [listed] = await recordings(paths);
    const show = vi.fn();
    expect(await revealRecording(paths, listed?.id ?? '', show)).toBe(true);
    expect(show).toHaveBeenCalledExactlyOnceWith(
      join(paths.folder, 'YapYap call 2026-10-27 09.00.webm'),
    );
    expect(await revealRecording(paths, 'f'.repeat(32), show)).toBe(false);
    rmSync(join(paths.folder, 'YapYap call 2026-10-27 09.00.webm'));
    expect(await revealRecording(paths, listed?.id ?? '', show)).toBe(false);
    expect(show).toHaveBeenCalledOnce();
  });
});
