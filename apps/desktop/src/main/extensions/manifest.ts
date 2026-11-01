import { ManifestSchema, type Manifest } from '@yapyap/extension-sdk';
import type { ExtensionArchive } from '@yapyap/extension-sign';
import { Value } from 'typebox/value';
import { en } from '../../shared/messages/en.ts';

export type ManifestCheck =
  | { readonly valid: true; readonly manifest: Manifest }
  | { readonly valid: false; readonly reason: string };

/** Only the first problem: one clear reason reads better than a list of schema errors. */
function firstError(value: unknown): string {
  const problem = [...Value.Errors(ManifestSchema, value)]
    .slice(0, 1)
    .map((error) =>
      error.instancePath === '' ? error.message : `${error.instancePath} ${error.message}`,
    );
  return en.extensions.reason.manifestInvalid({ problem: problem.join('') });
}

/**
 * Checks an archive's manifest against the published schema, and that the
 * files it names are in the archive, so an extension that could never start is
 * refused before the user is asked to trust it.
 */
export function checkManifest(archive: ExtensionArchive): ManifestCheck {
  if (!Value.Check(ManifestSchema, archive.manifest)) {
    return { valid: false, reason: firstError(archive.manifest) };
  }
  const manifest = archive.manifest;
  const entries = [manifest.entry, manifest.contributes?.panel?.entry];
  const missing = entries.find((entry) => entry !== undefined && !archive.files.has(entry));
  return missing === undefined
    ? { valid: true, manifest }
    : { valid: false, reason: en.extensions.reason.missingFile({ file: missing }) };
}
