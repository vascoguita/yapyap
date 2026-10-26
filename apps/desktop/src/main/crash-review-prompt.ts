import { dialog } from 'electron';
import { en } from '../shared/messages/en.ts';
import { PRODUCT_NAME } from './identity.ts';
import type { CrashReviewChoice } from './crash/crash-reports.ts';

const TEXT = en.dialogs.crashReview;

const CHOICES: readonly CrashReviewChoice[] = ['report', 'copy', 'close'];

/** Shows the whole report, so the user sees exactly what a bug report would contain. */
export async function reviewCrashWithDialog(report: string): Promise<CrashReviewChoice> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: PRODUCT_NAME,
    message: TEXT.message,
    detail: TEXT.detail({ report }),
    buttons: [TEXT.report, TEXT.copy, en.common.close],
    defaultId: 2,
    cancelId: 2,
  });
  return CHOICES[response] ?? 'close';
}
