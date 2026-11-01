import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fingerprint as keyFingerprint } from '../../../packages/extension-sign/src/keys.ts';
import { verifyExtensionFolder } from '../../../packages/extension-sign/src/extension-folder.ts';
import { builtFirstParty, signFirstParty } from './first-party.ts';

/** A key made for this test run only; it is never written anywhere. */
function testKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  return privateKey.export({ format: 'pem', type: 'pkcs8' });
}

function workspace(manifests: Readonly<Record<string, object | undefined>>): string {
  const root = mkdtempSync(join(tmpdir(), 'yapyap-extensions-'));
  for (const [name, manifest] of Object.entries(manifests)) {
    const dist = join(root, name, 'dist');
    mkdirSync(dist, { recursive: true });
    if (manifest !== undefined) {
      writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));
      writeFileSync(join(dist, 'main.js'), 'export default {};');
    }
  }
  return root;
}

const OURS = { id: 'org.guita.yapyap.call-recorder', version: '0.1.0', entry: 'main.js' };

describe('builtFirstParty', () => {
  it('finds the built extensions under YapYap’s own ID, and only those', () => {
    const root = workspace({
      'call-recorder': OURS,
      example: { id: 'org.example.greeter', version: '1.0.0' },
      unbuilt: undefined,
      odd: { id: 'org.guita.yapyap.odd', version: 1 },
    });
    expect(builtFirstParty(root, readdirSync(root))).toEqual([
      { folder: join(root, 'call-recorder', 'dist'), id: OURS.id, version: '0.1.0' },
    ]);
  });
});

describe('signFirstParty', () => {
  it('signs and packs each extension, printing only the key’s fingerprint', () => {
    const root = workspace({ 'call-recorder': OURS });
    const out = mkdtempSync(join(tmpdir(), 'yapyap-out-'));
    const key = testKey();
    const extensions = builtFirstParty(root, ['call-recorder']);
    const log = vi.fn();
    const fingerprint = keyFingerprint(createPublicKey(key));
    const archives = signFirstParty(extensions, key, new Set([fingerprint]), out, log);
    expect(archives).toEqual([join(out, 'org.guita.yapyap.call-recorder-0.1.0.yapyap-extension')]);
    expect(readFileSync(archives[0] ?? '').length).toBeGreaterThan(0);
    expect(verifyExtensionFolder(join(root, 'call-recorder', 'dist'))).toMatchObject({
      valid: true,
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      `Signed org.guita.yapyap.call-recorder 0.1.0 with key ${fingerprint}`,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE KEY');
  });

  it('refuses a key that is not a trust anchor, since the extension could never install', () => {
    const root = workspace({ 'call-recorder': OURS });
    const out = mkdtempSync(join(tmpdir(), 'yapyap-out-'));
    expect(() =>
      signFirstParty(builtFirstParty(root, ['call-recorder']), testKey(), new Set(), out, vi.fn()),
    ).toThrow(/is not one of YapYap's trust anchors/);
    expect(readdirSync(out)).toEqual([]);
  });
});
