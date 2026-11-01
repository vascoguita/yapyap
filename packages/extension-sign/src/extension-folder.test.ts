import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { signExtensionFolder, verifyExtensionFolder } from './extension-folder.ts';

// A throwaway key per test run, kept in memory only (ADR 0005).
const PEM = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });

function extension(manifest = '{"id":"org.example.hello","version":"1.0.0"}'): string {
  const root = tempDir('yapyap-extension-');
  writeFileSync(join(root, 'manifest.json'), manifest);
  writeFileSync(join(root, 'main.js'), 'export {};');
  return root;
}

describe('signExtensionFolder and verifyExtensionFolder', () => {
  it('signs in place, keeping the manifest readable, and verifies', () => {
    const root = extension();
    const fingerprint = signExtensionFolder(root, PEM);
    const manifest = readFileSync(join(root, 'manifest.json'), 'utf8');
    expect(manifest).toMatch(
      /^\{\n {2}"id": "org\.example\.hello",[\s\S]*"signature": \{[\s\S]*\}\n$/,
    );
    expect(manifest).not.toContain('PRIVATE KEY');
    expect(verifyExtensionFolder(root)).toEqual({ valid: true, fingerprint });
  });

  it('notices a file changed after signing', () => {
    const root = extension();
    signExtensionFolder(root, PEM);
    writeFileSync(join(root, 'main.js'), 'export const evil = true;');
    expect(verifyExtensionFolder(root).valid).toBe(false);
  });

  it.each([
    ['no manifest', null, 'No readable manifest.json in'],
    ['a manifest that is not JSON', '{', 'No readable manifest.json in'],
    ['a manifest that is not an object', '[1]', 'manifest.json must hold a JSON object.'],
    ['a null manifest', 'null', 'manifest.json must hold a JSON object.'],
    ['a number for a manifest', '5', 'manifest.json must hold a JSON object.'],
  ])('refuses a folder with %s', (_, manifest, message) => {
    const root = tempDir('yapyap-extension-');
    if (manifest !== null) {
      writeFileSync(join(root, 'manifest.json'), manifest);
    }
    expect(() => verifyExtensionFolder(root)).toThrow(message);
  });
});
