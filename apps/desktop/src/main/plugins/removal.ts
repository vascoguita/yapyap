import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRecords, saveRecords } from './records.ts';
import { manifestIn, type PluginRuntime } from './runtime.ts';

export interface RemovalDependencies {
  /** Where plugins are installed, such as `<userData>/plugins`. */
  readonly root: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** Asks the user to confirm removing the plugin called `name`. */
  readonly confirmRemove: (name: string) => Promise<boolean>;
  /** Deletes the plugin's key-value store and secrets. */
  readonly forgetData: (id: string) => Promise<void>;
}

/**
 * Removes an installed plugin once the user confirms, with everything it
 * kept (#332): it stops first, so nothing it does lands after its data is
 * gone, and its record goes before its files, so a failure halfway never
 * leaves a record pointing at files that are not there. The audit log keeps
 * its entries, which hold no parameters or results. False when the plugin
 * is not installed or the user changed their mind.
 */
export async function removePlugin(
  deps: RemovalDependencies,
  runtime: Pick<PluginRuntime, 'forget'>,
  id: string,
): Promise<boolean> {
  const installed = await loadRecords(deps.root);
  const record = installed.get(id);
  if (record === undefined) {
    return false;
  }
  const manifest = await manifestIn(join(deps.root, id, record.version), deps.readFile);
  if (!(await deps.confirmRemove(manifest?.name ?? id))) {
    return false;
  }
  await runtime.forget(id);
  // Read again: the user may have changed another plugin's grants while asked.
  const records = new Map(await loadRecords(deps.root));
  records.delete(id);
  await saveRecords(deps.root, records);
  await rm(join(deps.root, id), { recursive: true, force: true });
  await deps.forgetData(id);
  return true;
}
