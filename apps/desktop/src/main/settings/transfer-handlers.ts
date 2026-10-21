import { CHROME_CHANNELS, type TransferResult } from '../../shared/chrome-api.ts';
import { noArguments, type ChromeCall, type ChromeHandler } from '../chrome/ipc.ts';
import type { SettingsService } from './service.ts';
import { exportSettings, readImport } from './transfer.ts';

/** The file dialogs and file access behind export and import; `owner` is the calling window's contents. */
export interface SettingsFiles {
  /** The file to export to, or undefined when the user cancels. */
  readonly chooseExport: (owner: object) => Promise<string | undefined>;
  /** The file to import, or undefined when the user cancels. */
  readonly chooseImport: (owner: object) => Promise<string | undefined>;
  /** Asks before replacing the settings; true when the user agrees. */
  readonly confirmImport: (owner: object, detail: string) => Promise<boolean>;
  /** Reads a bounded prefix of the file, so a huge or endless file cannot stall YapYap. */
  readonly read: (path: string) => Promise<string>;
  readonly write: (path: string, text: string) => Promise<void>;
}

const CANCELLED: TransferResult = { outcome: 'cancelled', message: '' };

function confirmation(reset: readonly string[]): string {
  const replaced = 'Your current settings will be replaced.';
  if (reset.length === 0) {
    return replaced;
  }
  const values = reset.length === 1 ? 'value' : 'values';
  return `${replaced} ${String(reset.length)} invalid ${values} in the file will use the default instead.`;
}

async function exportTo(
  service: SettingsService,
  files: SettingsFiles,
  call: ChromeCall,
): Promise<TransferResult> {
  const path = await files.chooseExport(call.sender);
  if (path === undefined) {
    return CANCELLED;
  }
  try {
    await files.write(path, exportSettings(service.current()));
    return { outcome: 'done', message: 'Settings exported.' };
  } catch {
    return { outcome: 'failed', message: 'Could not save the settings file.' };
  }
}

async function importFrom(
  service: SettingsService,
  files: SettingsFiles,
  call: ChromeCall,
): Promise<TransferResult> {
  const path = await files.chooseImport(call.sender);
  if (path === undefined) {
    return CANCELLED;
  }
  let text: string;
  try {
    text = await files.read(path);
  } catch {
    return { outcome: 'failed', message: 'Could not read that file.' };
  }
  const result = readImport(text);
  if (result.kind === 'rejected') {
    return { outcome: 'failed', message: result.reason };
  }
  if (!(await files.confirmImport(call.sender, confirmation(result.reset)))) {
    return CANCELLED;
  }
  service.update(() => result.settings);
  return { outcome: 'done', message: 'Settings imported.' };
}

/**
 * Export and import for the settings window. Import refuses settings that
 * belong to a newer YapYap, because those must never be overwritten.
 */
export function settingsTransferHandlers(
  service: SettingsService,
  files: SettingsFiles,
): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.settingsExport,
      accepts: noArguments,
      handle: (call) => exportTo(service, files, call),
    },
    {
      channel: CHROME_CHANNELS.settingsImport,
      accepts: (args) => noArguments(args) && !service.readOnly,
      handle: (call) => importFrom(service, files, call),
    },
  ];
}
