import { join } from 'node:path';
import type { ExtensionSetting } from '../../shared/chrome-api.ts';
import { loadRecords, saveRecords, type ExtensionRecord } from './records.ts';
import { manifestIn, type ExtensionRuntime } from './runtime.ts';
import { fits, formOf, valuesOf, type SettingField } from './settings-form.ts';

type ReadFile = (path: string) => Promise<Uint8Array>;

/** The settings form the installed version's manifest declares. */
async function formFor(
  root: string,
  record: ExtensionRecord,
  readFile: ReadFile,
): Promise<SettingField[]> {
  const manifest = await manifestIn(join(root, record.id, record.version), readFile);
  return formOf(manifest?.contributes?.settings);
}

/** What the Extensions window shows of an extension's settings: the form, with what the user saved. */
export async function settingsOf(
  root: string,
  record: ExtensionRecord,
  readFile: ReadFile,
): Promise<ExtensionSetting[]> {
  const form = await formFor(root, record, readFile);
  const values = valuesOf(form, record.settings);
  return form.map((field) => {
    const value = values[field.key];
    return value === undefined ? field : { ...field, value };
  });
}

/** A setting change: an extension, a short key, and a plain value or null. */
export function isSettingChange([id, key, value, ...rest]: readonly unknown[]): boolean {
  const plain = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  return rest.length === 0 && typeof id === 'string' && typeof key === 'string' && plain;
}

/**
 * Saves one setting if it fits the extension's form, or forgets it with null,
 * and lets the running extension read the new value at once (#98).
 */
export async function saveSetting(
  root: string,
  readFile: ReadFile,
  runtime: Pick<ExtensionRuntime, 'regrant'>,
  [id, key, value]: readonly unknown[],
): Promise<void> {
  const records = await loadRecords(root);
  const record = records.get(String(id));
  if (record === undefined) {
    return;
  }
  const form = await formFor(root, record, readFile);
  const field = form.find((entry) => entry.key === key);
  if (field === undefined || (value !== null && !fits(field, value))) {
    return;
  }
  const settings = Object.fromEntries(
    Object.entries(record.settings ?? {}).filter(([name]) => name !== field.key),
  );
  const saved = value === null ? settings : { ...settings, [field.key]: value };
  await saveRecords(root, new Map(records).set(record.id, { ...record, settings: saved }));
  await runtime.regrant(record.id);
}
