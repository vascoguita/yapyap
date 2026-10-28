import { generateKeyPairSync } from 'node:crypto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ARCHIVE_LIMITS, readExtensionArchive, verifyArchive } from './archive.ts';
import { readPrivateKey } from './keys.ts';
import { signManifest } from './signature.ts';
import { createHash } from 'node:crypto';

// A throwaway key per test run, kept in memory only (ADR 0005).
const KEY = readPrivateKey(
  generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }),
);
const MANIFEST = { id: 'org.example.hello', version: '1.0.0' };

function zip(entries: Zippable): Uint8Array {
  return zipSync(entries);
}

function signedExtension(files: Record<string, string>): Uint8Array {
  const digests = Object.entries(files).map(
    ([path, text]) => [path, createHash('sha256').update(text).digest('hex')] as const,
  );
  const manifest = signManifest(MANIFEST, digests, KEY);
  return zip({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    ...Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])),
  });
}

describe('readExtensionArchive and verifyArchive', () => {
  it('reads a signed extension in memory and verifies it', () => {
    const archive = readExtensionArchive(
      signedExtension({ 'main.js': 'export {};', 'assets/icon.svg': '<svg/>' }),
    );
    expect(archive.manifest['id']).toBe('org.example.hello');
    expect([...archive.files.keys()].sort()).toEqual(['assets/icon.svg', 'main.js']);
    expect(verifyArchive(archive)).toEqual({
      valid: true,
      fingerprint: expect.any(String) as unknown,
    });
  });

  it('fails verification for an extra file the signature does not list', () => {
    const bytes = signedExtension({ 'main.js': 'export {};' });
    const archive = readExtensionArchive(bytes);
    const tampered = { ...archive, files: new Map([...archive.files, ['evil.js', strToU8('x')]]) };
    expect(verifyArchive(tampered).valid).toBe(false);
  });

  it('uses these limits by default', () => {
    expect(ARCHIVE_LIMITS).toEqual({
      archiveBytes: 20 * 1024 * 1024,
      entries: 512,
      fileBytes: 10 * 1024 * 1024,
      totalBytes: 50 * 1024 * 1024,
    });
  });

  it('accepts ordinary names, including spaces and the longest path allowed', () => {
    const longest = `${'a'.repeat(197)}.js`;
    const archive = readExtensionArchive(
      zip({ 'manifest.json': strToU8('{}'), 'my file.js': strToU8('x'), [longest]: strToU8('y') }),
    );
    expect([...archive.files.keys()].sort()).toEqual([longest, 'my file.js']);
  });

  it('quotes at most 200 characters of an unsafe path', () => {
    const name = `${'a'.repeat(300)}.js`;
    expect(() =>
      readExtensionArchive(zip({ 'manifest.json': strToU8('{}'), [name]: strToU8('x') })),
    ).toThrow(`The extension archive has an unsafe path: "${'a'.repeat(200)}"`);
  });

  it('accepts an archive exactly at each limit', () => {
    const bytes = zip({
      'manifest.json': strToU8('{}'),
      'a.js': new Uint8Array(100),
      'b.js': new Uint8Array(100),
    });
    expect(
      readExtensionArchive(bytes, {
        archiveBytes: bytes.length,
        entries: 3,
        fileBytes: 100,
        totalBytes: 202,
      }).files.size,
    ).toBe(2);
  });

  it('skips directory entries', () => {
    const archive = readExtensionArchive(
      zip({ 'manifest.json': strToU8('{}'), 'assets/': [new Uint8Array(), {}] }),
    );
    expect(archive.files.size).toBe(0);
  });

  it.each([
    '../escape.js',
    'a/../../escape.js',
    '/etc/passwd',
    'C:/Windows/evil.js',
    'dir\\evil.js',
    './main.js',
    'a//b.js',
    'bell\u0007.js',
    'del\u007f.js',
    `${'a'.repeat(201)}.js`,
  ])('refuses the path %j', (name) => {
    expect(() =>
      readExtensionArchive(zip({ 'manifest.json': strToU8('{}'), [name]: strToU8('x') })),
    ).toThrow(/^The extension archive has an unsafe path: /);
  });

  it('refuses names that collide on case-insensitive file systems', () => {
    expect(() =>
      readExtensionArchive(
        zip({ 'manifest.json': strToU8('{}'), 'Main.js': strToU8('a'), 'main.js': strToU8('b') }),
      ),
    ).toThrow('The extension archive lists main.js twice.');
  });

  it('refuses an archive larger than the limit, before reading it', () => {
    const limits = { ...ARCHIVE_LIMITS, archiveBytes: 10 };
    expect(() => readExtensionArchive(zip({ 'manifest.json': strToU8('{}') }), limits)).toThrow(
      'The extension archive is too large.',
    );
  });

  it('refuses too many entries', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [`f${String(index)}.js`, strToU8('x')]),
    );
    expect(() =>
      readExtensionArchive(zip({ 'manifest.json': strToU8('{}'), ...entries }), {
        ...ARCHIVE_LIMITS,
        entries: 3,
      }),
    ).toThrow('The extension archive has too many entries.');
  });

  it('refuses a zip bomb: a small archive that unpacks too large', () => {
    const bomb = zip({ 'manifest.json': strToU8('{}'), 'big.js': new Uint8Array(2048) });
    expect(bomb.length).toBeLessThan(400);
    expect(() => readExtensionArchive(bomb, { ...ARCHIVE_LIMITS, fileBytes: 1024 })).toThrow(
      'The extension archive is too large once unpacked.',
    );
    expect(() => readExtensionArchive(bomb, { ...ARCHIVE_LIMITS, totalBytes: 1500 })).toThrow(
      'The extension archive is too large once unpacked.',
    );
  });

  /**
   * An archive whose headers claim `claimed` bytes for every file of `actual`
   * bytes. A stored file comes back as long as its header claims, so claiming
   * less needs storing; a compressed one comes back as long as it really is,
   * so claiming more needs compression.
   */
  function lyingArchive(names: readonly string[], actual: number, claimed: number): Uint8Array {
    const bytes = zipSync(
      {
        'manifest.json': strToU8('{}'),
        ...Object.fromEntries(names.map((name) => [name, new Uint8Array(actual)])),
      },
      { level: claimed < actual ? 0 : 6 },
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
      const signature = view.getUint32(offset, true);
      // The uncompressed size field of the local header and of the central directory entry.
      const field = signature === 0x04034b50 ? 22 : signature === 0x02014b50 ? 24 : undefined;
      if (field !== undefined && view.getUint32(offset + field, true) === actual) {
        view.setUint32(offset + field, claimed, true);
      }
    }
    return bytes;
  }

  it('trusts the unpacked bytes over smaller sizes the headers claim', () => {
    const limits = { ...ARCHIVE_LIMITS, fileBytes: 1024, totalBytes: 3000 };
    expect(() => readExtensionArchive(lyingArchive(['big.js'], 2048, 7), limits)).toThrow(
      'The extension archive is too large once unpacked.',
    );
    expect(() =>
      readExtensionArchive(lyingArchive(['a.js', 'b.js', 'c.js'], 1000, 7), limits),
    ).toThrow('The extension archive is too large once unpacked.');
  });

  it('refuses larger sizes the headers claim before unpacking anything', () => {
    expect(() =>
      readExtensionArchive(lyingArchive(['small.js'], 10, 2048), {
        ...ARCHIVE_LIMITS,
        fileBytes: 1024,
      }),
    ).toThrow('The extension archive is too large once unpacked.');
    expect(() =>
      readExtensionArchive(lyingArchive(['a.js', 'b.js'], 10, 600), {
        ...ARCHIVE_LIMITS,
        fileBytes: 1024,
        totalBytes: 1000,
      }),
    ).toThrow('The extension archive is too large once unpacked.');
  });

  it.each([
    ['not a ZIP', strToU8('hello'), 'The extension archive is not a valid ZIP file.'],
    [
      'no manifest',
      zip({ 'main.js': strToU8('x') }),
      'The extension archive has no readable manifest.json.',
    ],
    [
      'a manifest that is not JSON',
      zip({ 'manifest.json': strToU8('{') }),
      'The extension archive has no readable manifest.json.',
    ],
    [
      'a manifest that is not UTF-8',
      zip({ 'manifest.json': new Uint8Array([0xff, 0xfe]) }),
      'The extension archive has no readable manifest.json.',
    ],
    [
      'a manifest that is an array',
      zip({ 'manifest.json': strToU8('[]') }),
      'manifest.json must hold a JSON object.',
    ],
    [
      'a manifest that is null',
      zip({ 'manifest.json': strToU8('null') }),
      'manifest.json must hold a JSON object.',
    ],
    [
      'a manifest that is a number',
      zip({ 'manifest.json': strToU8('5') }),
      'manifest.json must hold a JSON object.',
    ],
    [
      // Valid JSON once the bad byte is replaced, so only strict decoding catches it.
      'a manifest with invalid UTF-8 inside a string',
      zip({
        'manifest.json': new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
      }),
      'The extension archive has no readable manifest.json.',
    ],
  ])('refuses %s', (_, bytes, message) => {
    expect(() => readExtensionArchive(bytes)).toThrow(message);
  });
});
