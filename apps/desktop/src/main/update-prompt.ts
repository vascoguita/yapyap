import { dialog } from 'electron';

/** Installing restarts YapYap, so Later is the default and Escape answer. */
export async function askToInstallUpdateWithDialog(version: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'YapYap',
    message: `YapYap ${version} is ready to install`,
    detail:
      'It was downloaded and verified. Restart YapYap to install it now, or keep working and install it later.',
    buttons: ['Restart and Install', 'Later'],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
