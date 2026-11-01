import { dialog, systemPreferences } from 'electron';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity/product.ts';
import { confirm } from '../dialogs/confirm.ts';
import type { ViewInfo } from '../security/views.ts';
import type { MediaType } from './session-guard.ts';

const TEXT = en.dialogs.media;
const DEVICE_NAMES: Readonly<Record<MediaType, string>> = TEXT.devices;
/** Joins the devices as the catalog's language does: "microphone and camera". */
const DEVICE_LIST = new Intl.ListFormat('en', { type: 'conjunction' });
const SYSTEM_DEVICES = { audio: 'microphone', video: 'camera' } as const;

/**
 * macOS gives an app no microphone or camera input until the user allows it
 * there too, so after YapYap's own question the system asks its own, once
 * per device. Its refusal is final for the request, and the user learns
 * where to change it rather than joining a silent call.
 */
async function systemAllows(mediaTypes: readonly MediaType[]): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true;
  }
  for (const type of mediaTypes) {
    if (!(await systemPreferences.askForMediaAccess(SYSTEM_DEVICES[type]))) {
      await dialog.showMessageBox({
        type: 'warning',
        title: PRODUCT_NAME,
        message: TEXT.systemRefused({ device: DEVICE_NAMES[type] }),
        detail: TEXT.systemRefusedDetail,
      });
      return false;
    }
  }
  return true;
}

/** Names the account, so the user knows which one is asking. */
export async function askMediaWithDialog(
  view: ViewInfo,
  mediaTypes: readonly MediaType[],
): Promise<boolean> {
  const allowed = await confirm({
    type: 'question',
    message: TEXT.request({
      account: view.label,
      devices: DEVICE_LIST.format(mediaTypes.map((type) => DEVICE_NAMES[type])),
    }),
    detail: TEXT.detail,
    yes: TEXT.allow,
    no: TEXT.deny,
  });
  return allowed && systemAllows(mediaTypes);
}
