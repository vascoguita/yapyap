import { dialog } from 'electron';
import { en } from '../shared/messages/en.ts';
import { PRODUCT_NAME } from './identity.ts';

const TEXT = en.dialogs.installUpdate;

/** Installing restarts YapYap, so Later is the default and Escape answer. */
export async function askToInstallUpdateWithDialog(version: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: PRODUCT_NAME,
    message: TEXT.message(version),
    detail: TEXT.detail,
    buttons: [TEXT.install, TEXT.later],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
