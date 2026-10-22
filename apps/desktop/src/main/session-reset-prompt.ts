import { dialog } from 'electron';
import { en } from '../shared/messages/en.ts';
import { PRODUCT_NAME } from './identity.ts';

const TEXT = en.dialogs.resetSession;

/** Resetting cannot be undone, so Cancel is the default and Escape answer. */
export async function confirmResetWithDialog(): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: PRODUCT_NAME,
    message: TEXT.message,
    detail: TEXT.detail,
    buttons: [TEXT.confirm, en.common.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
