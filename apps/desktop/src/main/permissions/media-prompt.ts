import { dialog } from 'electron';
import type { ViewInfo } from '../views.ts';
import type { MediaType } from './session-guard.ts';

const DEVICE_NAMES: Readonly<Record<MediaType, string>> = {
  audio: 'microphone',
  video: 'camera',
};

/** Names the account, so the user knows which one is asking. */
export async function askMediaWithDialog(
  view: ViewInfo,
  mediaTypes: readonly MediaType[],
): Promise<boolean> {
  const devices = mediaTypes.map((type) => DEVICE_NAMES[type]).join(' and ');
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'YapYap',
    message: `${view.label} wants to use your ${devices}.`,
    detail: 'YapYap remembers your answer until you quit.',
    buttons: ['Allow', 'Deny'],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
