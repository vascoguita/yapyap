import {
  BaseWindow,
  BrowserWindow,
  dialog,
  systemPreferences,
  type MessageBoxOptions,
  type WebContents,
} from 'electron';
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
async function systemAllows(
  mediaTypes: readonly MediaType[],
  parent: Electron.BaseWindow | undefined,
): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true;
  }
  for (const type of mediaTypes) {
    if (!(await systemPreferences.askForMediaAccess(SYSTEM_DEVICES[type]))) {
      const options: MessageBoxOptions = {
        type: 'warning',
        title: PRODUCT_NAME,
        message: TEXT.systemRefused({ device: DEVICE_NAMES[type] }),
        detail: TEXT.systemRefusedDetail,
      };
      await (parent === undefined
        ? dialog.showMessageBox(options)
        : dialog.showMessageBox(parent, options));
      return false;
    }
  }
  return true;
}

/**
 * The window the question goes on top of: the one that asked, such as a
 * call's own window, else the one in front, such as the main window, whose
 * accounts are views Electron gives no window for. A question with no
 * window can open behind a call's window, which then waits for it blank
 * (#724).
 */
function windowFor(contents: object | null): Electron.BaseWindow | undefined {
  const owner = contents === null ? null : BrowserWindow.fromWebContents(contents as WebContents);
  return owner ?? BaseWindow.getFocusedWindow() ?? undefined;
}

/** Names the account, so the user knows which one is asking. */
export async function askMediaWithDialog(
  view: ViewInfo,
  mediaTypes: readonly MediaType[],
  contents: object | null,
): Promise<boolean> {
  const parent = windowFor(contents);
  const allowed = await confirm({
    type: 'question',
    message: TEXT.request({
      account: view.label,
      devices: DEVICE_LIST.format(mediaTypes.map((type) => DEVICE_NAMES[type])),
    }),
    detail: TEXT.detail,
    yes: TEXT.allow,
    no: TEXT.deny,
    ...(parent === undefined ? {} : { parent }),
  });
  return allowed && systemAllows(mediaTypes, parent);
}
