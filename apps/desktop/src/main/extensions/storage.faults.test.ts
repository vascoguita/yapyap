import type * as Fs from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFiles, type ExtensionFiles } from './storage.ts';

// Renames and folder creation fail or race only on demand, so the recovery
// paths a real file system rarely takes can be checked.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, mkdir: vi.fn(actual.mkdir), rename: vi.fn(actual.rename) };
});

const actual = await vi.importActual<typeof Fs>('node:fs/promises');
const ID = 'org.example.hello';

function files(entries: Record<string, string>): ExtensionFiles {
  return new Map(Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]));
}

function failure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('installFiles when the file system misbehaves', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'yapyap-faults-'));
    root = join(base, 'extensions');
    outside = join(base, 'outside');
    await actual.mkdir(outside);
  });

  afterEach(async () => {
    vi.mocked(mkdir).mockImplementation(actual.mkdir);
    vi.mocked(rename).mockImplementation(actual.rename);
    await rm(base, { recursive: true, force: true });
  });

  it('refuses to write through a folder swapped for a link while staging', async () => {
    vi.mocked(mkdir).mockImplementation(async (path, options) => {
      if (String(path).endsWith('linked')) {
        await symlink(outside, path);
        return undefined;
      }
      return actual.mkdir(path, options);
    });
    await expect(installFiles(root, ID, '1.0.0', files({ 'linked/main.js': 'x' }))).rejects.toThrow(
      'An extension file would land outside its folder.',
    );
    await expect(readdir(outside)).resolves.toEqual([]);
    await expect(readdir(root)).resolves.toEqual([ID]);
  });

  it('puts the installed copy back when the new one cannot be moved in', async () => {
    await installFiles(root, ID, '1.0.0', files({ 'main.js': 'old' }));
    vi.mocked(rename).mockImplementationOnce(actual.rename).mockRejectedValueOnce(failure('EXDEV'));
    await expect(installFiles(root, ID, '1.0.0', files({ 'main.js': 'new' }))).rejects.toThrow(
      'EXDEV',
    );
    await expect(readFile(join(root, ID, '1.0.0', 'main.js'), 'utf8')).resolves.toBe('old');
    await expect(readdir(root)).resolves.toEqual([ID]);
  });

  it('cleans up when a first install cannot be moved in', async () => {
    vi.mocked(rename).mockImplementationOnce(actual.rename).mockRejectedValueOnce(failure('EXDEV'));
    await expect(installFiles(root, ID, '1.0.0', files({ 'main.js': 'x' }))).rejects.toThrow(
      'EXDEV',
    );
    await expect(readdir(root)).resolves.toEqual([ID]);
    await expect(readdir(join(root, ID))).resolves.toEqual([]);
  });

  it('leaves the installed copy alone when it cannot be moved aside', async () => {
    await installFiles(root, ID, '1.0.0', files({ 'main.js': 'old' }));
    vi.mocked(rename).mockRejectedValueOnce(failure('EACCES'));
    await expect(installFiles(root, ID, '1.0.0', files({ 'main.js': 'new' }))).rejects.toThrow(
      'EACCES',
    );
    await expect(readFile(join(root, ID, '1.0.0', 'main.js'), 'utf8')).resolves.toBe('old');
    await expect(readdir(root)).resolves.toEqual([ID]);
  });
});
