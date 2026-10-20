import { dialog } from 'electron';

/** Resetting cannot be undone, so Cancel is the default and Escape answer. */
export async function confirmResetWithDialog(): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'YapYap',
    message: 'Reset this WhatsApp session?',
    detail:
      'This logs you out and deletes WhatsApp’s data on this computer. Your chats stay on your phone. To use WhatsApp here again, link this device again.',
    buttons: ['Reset Session', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
