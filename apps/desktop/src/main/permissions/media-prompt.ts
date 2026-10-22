import { dialog } from 'electron';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { ViewInfo } from '../views.ts';
import type { MediaType } from './session-guard.ts';

const TEXT = en.dialogs.media;
const DEVICE_NAMES: Readonly<Record<MediaType, string>> = TEXT.devices;

/** Names the account, so the user knows which one is asking. */
export async function askMediaWithDialog(
  view: ViewInfo,
  mediaTypes: readonly MediaType[],
): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: PRODUCT_NAME,
    message: TEXT.request(
      view.label,
      mediaTypes.map((type) => DEVICE_NAMES[type]),
    ),
    detail: TEXT.detail,
    buttons: [TEXT.allow, TEXT.deny],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}
