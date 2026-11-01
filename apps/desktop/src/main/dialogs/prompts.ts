import { dialog } from 'electron';
import { en } from '../../shared/messages/en.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { CrashReviewChoice } from '../crash/crash-reports.ts';
import { confirm } from './confirm.ts';

const TEXT = en.dialogs;

/** Removing deletes the account's data, so Cancel is the default answer. */
export function confirmRemoveAccountWithDialog(name: string): Promise<boolean> {
  return confirm({
    type: 'warning',
    message: TEXT.removeAccount.message({ name }),
    detail: TEXT.removeAccount.detail,
    yes: TEXT.removeAccount.confirm,
    no: en.common.cancel,
  });
}

/** Resetting cannot be undone, so Cancel is the default answer. */
export function confirmResetWithDialog(): Promise<boolean> {
  return confirm({
    type: 'warning',
    message: TEXT.resetSession.message,
    detail: TEXT.resetSession.detail,
    yes: TEXT.resetSession.confirm,
    no: en.common.cancel,
  });
}

/** Installing restarts YapYap, so Later is the default answer. */
export function askToInstallUpdateWithDialog(version: string): Promise<boolean> {
  return confirm({
    type: 'info',
    message: TEXT.installUpdate.message({ version }),
    detail: TEXT.installUpdate.detail,
    yes: TEXT.installUpdate.install,
    no: TEXT.installUpdate.later,
  });
}

/**
 * True when the user wants the troubleshooting guide. YapYap quits either
 * way, so the guide is the default answer.
 */
export function explainUnsafeStartWithDialog(message: string): Promise<boolean> {
  return confirm({
    type: 'error',
    message: TEXT.unsafeStart.message,
    detail: message,
    yes: TEXT.unsafeStart.guide,
    no: en.common.close,
    enterMeansYes: true,
  });
}

const CRASH_CHOICES: readonly CrashReviewChoice[] = ['report', 'copy', 'close'];

/** Shows the whole report, so the user sees exactly what a bug report would contain. */
export async function reviewCrashWithDialog(report: string): Promise<CrashReviewChoice> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: PRODUCT_NAME,
    message: TEXT.crashReview.message,
    detail: TEXT.crashReview.detail({ report }),
    buttons: [TEXT.crashReview.report, TEXT.crashReview.copy, en.common.close],
    defaultId: 2,
    cancelId: 2,
  });
  return CRASH_CHOICES[response] ?? 'close';
}
