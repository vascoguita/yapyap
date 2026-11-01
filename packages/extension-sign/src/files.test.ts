import { createHash } from 'node:crypto';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { constants } from 'node:fs';
import { digestFiles, readFlags } from './files.ts';

function extension(): string {
  const root = tempDir('yapyap-extension-');
  writeFileSync(join(root, 'manifest.json'), '{}');
  writeFileSync(join(root, 'main.js'), 'export {};');
  mkdirSync(join(root, 'assets', 'icons'), { recursive: true });
  writeFileSync(join(root, 'assets', 'icons', 'a.svg'), '<svg/>');
  return root;
}

describe('digestFiles', () => {
  it('lists every file but the manifest, by path, with its SHA-256', () => {
    const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
    expect(digestFiles(extension()).sort()).toEqual([
      ['assets/icons/a.svg', sha256('<svg/>')],
      ['main.js', sha256('export {};')],
    ]);
  });

  it('refuses symbolic links, which could point outside the extension', () => {
    const root = extension();
    symlinkSync('/etc/hostname', join(root, 'link'));
    expect(() => digestFiles(root)).toThrow('Extensions cannot contain symbolic links: link');
  });
});

describe('readFlags', () => {
  it('refuses to follow links where the system can, and just reads elsewhere', () => {
    expect(readFlags(constants.O_NOFOLLOW)).toBe(constants.O_RDONLY | constants.O_NOFOLLOW);
    expect(readFlags(undefined)).toBe(constants.O_RDONLY);
  });
});
