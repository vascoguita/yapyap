import { ARCHIVE_LIMITS } from '@yapyap/plugin-sign';
import { dialog } from 'electron';
import { open } from 'node:fs/promises';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { PluginChromeDependencies } from './plugin-chrome.ts';

const FILTERS = [{ name: en.plugins.fileType, extensions: ['yapyap-plugin'] }];

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

export const electronPluginDialogs: Pick<
  PluginChromeDependencies,
  'chooseArchive' | 'readFile' | 'showMessage'
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
};
