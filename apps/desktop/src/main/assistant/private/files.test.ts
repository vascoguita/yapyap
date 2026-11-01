import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PrivateModel } from './catalog.ts';
import { diskModelFiles } from './files.ts';

const MODEL: PrivateModel = {
  id: 'tiny',
  name: 'Tiny',
  url: 'https://models.example/tiny.gguf',
  size: 6,
  sha256: 'a'.repeat(64),
};

let root: string;
let folder: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-models-'));
  folder = join(root, 'models');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const collect = async (chunks: AsyncIterable<Uint8Array>): Promise<string> => {
  let text = '';
  for await (const chunk of chunks) {
    text += Buffer.from(chunk).toString();
  }
  return text;
};

describe('diskModelFiles', () => {
  it('keeps a partial download for the user alone, adds to it, and makes it the model', async () => {
    const files = diskModelFiles(folder);
    expect(await files.saved(MODEL)).toBe(0);
    expect(await collect(files.read(MODEL))).toBe('');
    expect(await files.used()).toBe(0);
    const first = await files.append(MODEL, true);
    await first.write(Buffer.from('abc'));
    await first.close();
    const rest = await files.append(MODEL, false);
    await rest.write(Buffer.from('def'));
    await rest.close();
    expect(await files.saved(MODEL)).toBe(6);
    expect(await collect(files.read(MODEL))).toBe('abcdef');
    // Windows has no POSIX modes; elsewhere the file is the user's alone.
    if (process.platform !== 'win32') {
      expect((await stat(join(folder, `${MODEL.sha256}.gguf.part`))).mode & 0o777).toBe(0o600);
    }
    await files.finish(MODEL);
    expect(files.path(MODEL)).toBe(join(folder, `${MODEL.sha256}.gguf`));
    expect(await readFile(files.path(MODEL), 'utf8')).toBe('abcdef');
    expect(await files.saved(MODEL)).toBe(0);
    expect(await files.used()).toBe(6);
  });

  it('starts over, discards and clears', async () => {
    const files = diskModelFiles(folder);
    const writer = await files.append(MODEL, true);
    await writer.write(Buffer.from('abc'));
    await writer.close();
    const again = await files.append(MODEL, true);
    await again.close();
    expect(await files.saved(MODEL)).toBe(0);
    await writeFile(join(folder, `${MODEL.sha256}.gguf.part`), 'x');
    await files.discard(MODEL);
    expect(await files.saved(MODEL)).toBe(0);
    await files.clear();
    await expect(stat(folder)).rejects.toThrow();
  });

  it('says how much room the disk has, or nothing when it cannot', async () => {
    expect(await diskModelFiles(folder).free()).toBeGreaterThan(0);
    await writeFile(join(root, 'file'), '');
    expect(await diskModelFiles(join(root, 'file', 'models')).free()).toBeUndefined();
  });
});
