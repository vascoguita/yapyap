import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  packPluginFolder,
  signPluginFolder,
} from '../../../packages/plugin-sign/src/plugin-folder.ts';
import { FIRST_PARTY_PREFIX } from '../../../packages/plugin-sign/src/trust.ts';

/** A plugin's built folder and what its manifest says it is. */
interface Built {
  readonly folder: string;
  readonly id: string;
  readonly version: string;
}

/** The first-party plugins built under `pluginsRoot`: each plugin's `dist/`, by its manifest's ID. */
export function builtFirstParty(pluginsRoot: string, names: readonly string[]): Built[] {
  return names.flatMap((name) => {
    const folder = join(pluginsRoot, name, 'dist');
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
 * Signs each built first-party plugin with YapYap's key, refuses a key that
 * is not one of the trust anchors (the plugin could never install), and
 * packs it into `<id>-<version>.yapyap-plugin` in `outDir`. The key stays
 * in memory; only its fingerprint is ever printed.
 */
export function signFirstParty(
  plugins: readonly Built[],
  keyPem: string,
  anchors: ReadonlySet<string>,
  outDir: string,
  log: (line: string) => void,
): string[] {
  return plugins.map(({ folder, id, version }) => {
    const fingerprint = signPluginFolder(folder, keyPem);
    if (!anchors.has(fingerprint)) {
      throw new Error(`The signing key ${fingerprint} is not one of YapYap's trust anchors.`);
    }
    const archive = join(outDir, `${id}-${version}.yapyap-plugin`);
    writeFileSync(archive, packPluginFolder(folder));
    log(`Signed ${id} ${version} with key ${fingerprint}`);
    return archive;
  });
}
