import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  packExtensionFolder,
  signExtensionFolder,
} from '../../../packages/extension-sign/src/extension-folder.ts';
import { FIRST_PARTY_PREFIX } from '../../../packages/extension-sign/src/trust.ts';

/** An extension's built folder and what its manifest says it is. */
interface Built {
  readonly folder: string;
  readonly id: string;
  readonly version: string;
}

/** The first-party extensions built under `extensionsRoot`: each extension's `dist/`, by its manifest's ID. */
export function builtFirstParty(extensionsRoot: string, names: readonly string[]): Built[] {
  return names.flatMap((name) => {
    const folder = join(extensionsRoot, name, 'dist');
    const manifestPath = join(folder, 'manifest.json');
    if (!existsSync(manifestPath)) {
      return [];
    }
    const { id, version } = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      id?: unknown;
      version?: unknown;
    };
    const ours = typeof id === 'string' && id.startsWith(FIRST_PARTY_PREFIX);
    return ours && typeof version === 'string' ? [{ folder, id, version }] : [];
  });
}

/**
 * Signs each built first-party extension with YapYap's key, refuses a key that
 * is not one of the trust anchors (the extension could never install), and
 * packs it into `<id>-<version>.yapyap-extension` in `outDir`. The key stays
 * in memory; only its fingerprint is ever printed.
 */
export function signFirstParty(
  extensions: readonly Built[],
  keyPem: string,
  anchors: ReadonlySet<string>,
  outDir: string,
  log: (line: string) => void,
): string[] {
  return extensions.map(({ folder, id, version }) => {
    const fingerprint = signExtensionFolder(folder, keyPem);
    if (!anchors.has(fingerprint)) {
      throw new Error(`The signing key ${fingerprint} is not one of YapYap's trust anchors.`);
    }
    const archive = join(outDir, `${id}-${version}.yapyap-extension`);
    writeFileSync(archive, packExtensionFolder(folder));
    log(`Signed ${id} ${version} with key ${fingerprint}`);
    return archive;
  });
}
