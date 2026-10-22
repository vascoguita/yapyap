import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signPluginFolder, verifyPluginFolder } from './plugin-folder.ts';

// A throwaway key per test run, kept in memory only (ADR 0005).
const PEM = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });

function plugin(manifest = '{"id":"org.example.hello","version":"1.0.0"}'): string {
  const root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-'));
  writeFileSync(join(root, 'manifest.json'), manifest);
  writeFileSync(join(root, 'main.js'), 'export {};');
  return root;
}

describe('signPluginFolder and verifyPluginFolder', () => {
  it('signs in place, keeping the manifest readable, and verifies', () => {
    const root = plugin();
    const fingerprint = signPluginFolder(root, PEM);
    const manifest = readFileSync(join(root, 'manifest.json'), 'utf8');
    expect(manifest).toMatch(
      /^\{\n {2}"id": "org\.example\.hello",[\s\S]*"signature": \{[\s\S]*\}\n$/,
    );
    expect(manifest).not.toContain('PRIVATE KEY');
    expect(verifyPluginFolder(root)).toEqual({ valid: true, fingerprint });
  });

  it('notices a file changed after signing', () => {
    const root = plugin();
    signPluginFolder(root, PEM);
    writeFileSync(join(root, 'main.js'), 'export const evil = true;');
    expect(verifyPluginFolder(root).valid).toBe(false);
  });

  it.each([
    ['no manifest', null, 'No readable manifest.json in'],
    ['a manifest that is not JSON', '{', 'No readable manifest.json in'],
    ['a manifest that is not an object', '[1]', 'manifest.json must hold a JSON object.'],
    ['a null manifest', 'null', 'manifest.json must hold a JSON object.'],
    ['a number for a manifest', '5', 'manifest.json must hold a JSON object.'],
  ])('refuses a folder with %s', (_, manifest, message) => {
    const root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-'));
    if (manifest !== null) {
      writeFileSync(join(root, 'manifest.json'), manifest);
    }
    expect(() => verifyPluginFolder(root)).toThrow(message);
  });
});
