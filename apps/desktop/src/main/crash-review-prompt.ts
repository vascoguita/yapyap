import { dialog } from 'electron';
import type { CrashReviewChoice } from './crash/crash-reports.ts';

const CHOICES: readonly CrashReviewChoice[] = ['report', 'copy', 'close'];

/** Shows the whole report, so the user sees exactly what a bug report would contain. */
export async function reviewCrashWithDialog(report: string): Promise<CrashReviewChoice> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'YapYap',
    message: 'YapYap closed unexpectedly last time',
    detail: `This report was saved on this computer and has not been sent anywhere. Report on GitHub opens a prefilled bug report for you to review and submit.\n\n${report}`,
    buttons: ['Report on GitHub…', 'Copy Report', 'Close'],
    defaultId: 2,
    cancelId: 2,
  });
  return CHOICES[response] ?? 'close';
}
