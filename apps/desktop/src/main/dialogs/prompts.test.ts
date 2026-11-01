import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/messages/en.ts';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const prompts = await import('./prompts.ts');

const TEXT = en.dialogs;

describe.each([
  {
    name: 'confirmRemoveAccountWithDialog',
    ask: () => prompts.confirmRemoveAccountWithDialog('Work'),
    shown: {
      type: 'warning',
      message: TEXT.removeAccount.message({ name: 'Work' }),
      detail: TEXT.removeAccount.detail,
      buttons: [TEXT.removeAccount.confirm, en.common.cancel],
      defaultId: 1,
    },
  },
  {
    name: 'confirmResetWithDialog',
    ask: () => prompts.confirmResetWithDialog(),
    shown: {
      type: 'warning',
      message: TEXT.resetSession.message,
      detail: TEXT.resetSession.detail,
      buttons: [TEXT.resetSession.confirm, en.common.cancel],
      defaultId: 1,
    },
  },
  {
    name: 'askToInstallUpdateWithDialog',
    ask: () => prompts.askToInstallUpdateWithDialog('1.2.3'),
    shown: {
      type: 'info',
      message: TEXT.installUpdate.message({ version: '1.2.3' }),
      detail: TEXT.installUpdate.detail,
      buttons: [TEXT.installUpdate.install, TEXT.installUpdate.later],
      defaultId: 1,
    },
  },
  {
    name: 'explainUnsafeStartWithDialog',
    ask: () => prompts.explainUnsafeStartWithDialog('Details.'),
    shown: {
      type: 'error',
      message: TEXT.unsafeStart.message,
      detail: 'Details.',
      buttons: [TEXT.unsafeStart.guide, en.common.close],
      defaultId: 0,
    },
  },
])('$name', ({ ask, shown }) => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('asks with its own text, and Escape answers no', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    await expect(ask()).resolves.toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      ...shown,
      title: 'YapYap',
      cancelId: 1,
    });
  });

  it('answers no for the second button', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(ask()).resolves.toBe(false);
  });
});

describe('reviewCrashWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it.each([
    [0, 'report'],
    [1, 'copy'],
    [2, 'close'],
    [7, 'close'],
  ])('maps button %i to %s', async (response, choice) => {
    showMessageBox.mockResolvedValueOnce({ response });
    await expect(prompts.reviewCrashWithDialog('the report')).resolves.toBe(choice);
  });

  it('shows the whole report and closes by default', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 2 });
    await prompts.reviewCrashWithDialog('the report');
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'info',
      title: 'YapYap',
      message: TEXT.crashReview.message,
      detail: TEXT.crashReview.detail({ report: 'the report' }),
      buttons: [TEXT.crashReview.report, TEXT.crashReview.copy, en.common.close],
      defaultId: 2,
      cancelId: 2,
    });
  });
});
