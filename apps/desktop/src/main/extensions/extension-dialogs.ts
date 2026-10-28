import { ARCHIVE_LIMITS } from '@yapyap/extension-sign';
import { dialog } from 'electron';
import { open } from 'node:fs/promises';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { ExtensionChromeDependencies } from './extension-chrome.ts';

const FILTERS = [{ name: en.extensions.fileType, extensions: ['yapyap-extension'] }];

/** One byte past the archive limit at most, so an oversized file is refused without reading it all. */
async function readArchive(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(ARCHIVE_LIMITS.archiveBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export const electronExtensionDialogs: Pick<
  ExtensionChromeDependencies,
  'chooseArchive' | 'readFile' | 'showMessage' | 'askHost' | 'confirmRemove'
> = {
  chooseArchive: async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: FILTERS,
      properties: ['openFile'],
    });
    return canceled ? undefined : filePaths[0];
  },
  readFile: readArchive,
  showMessage: ({ type, message, detail }) => {
    void dialog.showMessageBox({ title: PRODUCT_NAME, type, message, detail });
  },
  // Deny is the default, so a stray Enter never lets an extension reach a new host.
  askHost: async (extension, host) => {
    const text = en.dialogs.extensionHost;
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: PRODUCT_NAME,
      message: text.message({ extension, host }),
      detail: text.detail,
      buttons: [text.allow, text.deny],
      defaultId: 1,
      cancelId: 1,
    });
    return response === 0;
  },
  // Removing deletes the extension's data, so Cancel is the default and Escape answer.
  confirmRemove: async (extension) => {
    const text = en.dialogs.removeExtension;
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: PRODUCT_NAME,
      message: text.message({ extension }),
      detail: text.detail,
      buttons: [text.confirm, en.common.cancel],
      defaultId: 1,
      cancelId: 1,
    });
    return response === 0;
  },
};
