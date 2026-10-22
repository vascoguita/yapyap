import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFiles, pruneVersions, type PluginFiles } from './storage.ts';

const ID = 'org.example.hello';

function files(entries: Record<string, string>): PluginFiles {
  return new Map(Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]));
}

describe('installFiles and pruneVersions', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'yapyap-storage-'));
    root = join(base, 'plugins');
    outside = join(base, 'outside');
    await mkdir(outside);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('writes the files into <root>/<id>/<version>, creating folders on the way', async () => {
    const folder = await installFiles(
      root,
      ID,
      '1.0.0',
      files({ 'main.js': 'one', 'assets/icons/icon.svg': '<svg/>' }),
    );
    expect(folder).toBe(join(root, ID, '1.0.0'));
    await expect(readFile(join(folder, 'main.js'), 'utf8')).resolves.toBe('one');
    await expect(readFile(join(folder, 'assets/icons/icon.svg'), 'utf8')).resolves.toBe('<svg/>');
    await expect(readdir(root)).resolves.toEqual([ID]);
  });

  it('replaces a copy of the same version and leaves nothing behind', async () => {
    await installFiles(root, ID, '1.0.0', files({ 'main.js': 'old', 'gone.js': '' }));
    const folder = await installFiles(root, ID, '1.0.0', files({ 'main.js': 'new' }));
    await expect(readdir(folder)).resolves.toEqual(['main.js']);
    await expect(readFile(join(folder, 'main.js'), 'utf8')).resolves.toBe('new');
    await expect(readdir(root)).resolves.toEqual([ID]);
  });

  it('keeps the old version next to the new one until it is pruned', async () => {
    await installFiles(root, ID, '1.0.0', files({ 'main.js': 'old' }));
    await installFiles(root, ID, '1.1.0', files({ 'main.js': 'new' }));
    await expect(readdir(join(root, ID))).resolves.toEqual(['1.0.0', '1.1.0']);
    await pruneVersions(root, ID, '1.1.0');
    await expect(readdir(join(root, ID))).resolves.toEqual(['1.1.0']);
  });

  it.each(['../escape.js', '/etc/escape.js', 'assets/../../escape.js', ''])(
    'refuses the path %j and cleans up its staging folder',
    async (path) => {
      await expect(
        installFiles(root, ID, '1.0.0', files({ 'main.js': '', [path]: 'x' })),
      ).rejects.toThrow('A plugin file would land outside its folder.');
      await expect(readdir(root)).resolves.toEqual([ID]);
      await expect(readdir(join(root, ID))).resolves.toEqual([]);
    },
  );

  it.each([
    ['..', '1.0.0'],
    ['', '1.0.0'],
    ['org/example', '1.0.0'],
    [ID, '..'],
    [ID, '.'],
    [ID, '1.0.0/nested'],
  ])('refuses the ID %j with version %j', async (id, version) => {
    await expect(installFiles(root, id, version, files({ 'main.js': '' }))).rejects.toThrow(
      'A plugin ID or version is not a plain folder name.',
    );
    await expect(readdir(base)).resolves.toEqual(['outside']);
  });

  it('cleans up the staging folder when a write fails midway', async () => {
    await expect(
      installFiles(root, ID, '1.0.0', files({ 'main.js': '', a: 'file', 'a/b.js': 'below' })),
    ).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([ID]);
  });

  it('refuses a plugin folder that is a link to somewhere else', async () => {
    await mkdir(root);
    await symlink(outside, join(root, ID));
    await expect(installFiles(root, ID, '1.0.0', files({ 'main.js': 'x' }))).rejects.toThrow(
      'The plugin folder is not a folder.',
    );
    await expect(readdir(outside)).resolves.toEqual([]);
  });

  it('replaces a version folder that is a link without touching what it points to', async () => {
    await mkdir(join(root, ID), { recursive: true });
    await writeFile(join(outside, 'main.js'), 'theirs');
    await symlink(outside, join(root, ID, '1.0.0'));
    const folder = await installFiles(root, ID, '1.0.0', files({ 'main.js': 'ours' }));
    await expect(readFile(join(folder, 'main.js'), 'utf8')).resolves.toBe('ours');
    await expect(readFile(join(outside, 'main.js'), 'utf8')).resolves.toBe('theirs');
  });
});
