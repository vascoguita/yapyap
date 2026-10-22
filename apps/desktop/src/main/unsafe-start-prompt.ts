import { dialog } from 'electron';
import { en } from '../shared/messages/en.ts';
import { PRODUCT_NAME } from './identity.ts';

/** True when the user wants the troubleshooting guide. */
export async function explainUnsafeStartWithDialog(message: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: PRODUCT_NAME,
    message: en.dialogs.unsafeStart.message,
    detail: message,
    buttons: [en.dialogs.unsafeStart.guide, en.common.close],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}
