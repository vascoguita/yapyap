import { ARCHIVE_LIMITS } from '@yapyap/extension-sign';
import { dialog } from 'electron';
import { open } from 'node:fs/promises';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity/product.ts';
import { confirm } from '../dialogs/confirm.ts';
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
  'chooseArchive' | 'readFile' | 'showMessage' | 'askHost' | 'askLocal' | 'confirmRemove'
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
  askHost: (extension, host) =>
    confirm({
      type: 'question',
      message: en.dialogs.extensionHost.message({ extension, host }),
      detail: en.dialogs.extensionHost.detail,
      yes: en.dialogs.extensionHost.allow,
      no: en.dialogs.extensionHost.deny,
    }),
  // A server on this computer may offer much more than its model, so Deny is the default here too.
  askLocal: (extension, server) =>
    confirm({
      type: 'question',
      message: en.dialogs.extensionLocalServer.message({ extension, server }),
      detail: en.dialogs.extensionLocalServer.detail,
      yes: en.dialogs.extensionLocalServer.allow,
      no: en.dialogs.extensionLocalServer.deny,
    }),
  // Removing deletes the extension's data, so Cancel is the default and Escape answer.
  confirmRemove: (extension) =>
    confirm({
      type: 'warning',
      message: en.dialogs.removeExtension.message({ extension }),
      detail: en.dialogs.removeExtension.detail,
      yes: en.dialogs.removeExtension.confirm,
      no: en.common.cancel,
    }),
};
