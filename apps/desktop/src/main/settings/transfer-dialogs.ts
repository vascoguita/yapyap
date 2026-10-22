import { BrowserWindow, dialog, type WebContents } from 'electron';
import { open, writeFile } from 'node:fs/promises';
import type { SettingsFiles } from './transfer-handlers.ts';
import { MAX_IMPORT_BYTES } from './transfer.ts';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity.ts';

const FILTERS = [{ name: en.settings.backup.fileType, extensions: ['json'] }];

// The owner is the settings window's own web contents, handed over by IPC.
// Without a window there is nobody to ask, which counts as a cancel.
const windowOf = (owner: object): BrowserWindow | null =>
  BrowserWindow.fromWebContents(owner as WebContents);

/** One byte past the limit, so an oversized file is recognizable without reading it all. */
async function readPrefix(path: string): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(MAX_IMPORT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

export const electronSettingsFiles: SettingsFiles = {
  chooseExport: async (owner) => {
    const window = windowOf(owner);
    if (window === null) {
      return undefined;
    }
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: 'yapyap-settings.json',
      filters: FILTERS,
    });
    return canceled || filePath === '' ? undefined : filePath;
  },
  chooseImport: async (owner) => {
    const window = windowOf(owner);
    if (window === null) {
      return undefined;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      filters: FILTERS,
      properties: ['openFile'],
    });
    return canceled ? undefined : filePaths[0];
  },
  confirmImport: async (owner, detail) => {
    const window = windowOf(owner);
    if (window === null) {
      return false;
    }
    // Replacing settings cannot be undone, so Cancel is the default and Escape answer.
    const { response } = await dialog.showMessageBox(window, {
      detail,
      type: 'question',
      title: PRODUCT_NAME,
      message: en.settings.backup.confirm,
      buttons: [en.settings.backup.confirmButton, en.common.cancel],
      defaultId: 1,
      cancelId: 1,
    });
    return response === 0;
  },
  read: readPrefix,
  write: (path, text) => writeFile(path, text),
};
