import { dialog } from 'electron';
import { en } from '../shared/messages/en.ts';
import { PRODUCT_NAME } from './identity.ts';

const TEXT = en.dialogs.removeAccount;

/** Removing deletes the account's data, so Cancel is the default and Escape answer. */
export async function confirmRemoveAccountWithDialog(name: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: PRODUCT_NAME,
    message: TEXT.message(name),
    detail: TEXT.detail,
    buttons: [TEXT.confirm, en.common.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
