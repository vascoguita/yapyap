import { dialog } from 'electron';

/** True when the user wants the troubleshooting guide. */
export async function explainUnsafeStartWithDialog(message: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'YapYap',
    message: 'YapYap cannot start safely on this system',
    detail: message,
    buttons: ['Open Troubleshooting Guide', 'Close'],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}
