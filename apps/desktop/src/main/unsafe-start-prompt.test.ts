import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { explainUnsafeStartWithDialog } = await import('./unsafe-start-prompt.ts');

describe('explainUnsafeStartWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('explains the problem and offers the troubleshooting guide', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await explainUnsafeStartWithDialog('Details.')).toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'error',
      title: 'YapYap',
      message: 'YapYap cannot start safely on this system',
      detail: 'Details.',
      buttons: ['Open Troubleshooting Guide', 'Close'],
      defaultId: 0,
      cancelId: 1,
    });
  });

  it('just closes when the user chooses Close', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await explainUnsafeStartWithDialog('Details.')).toBe(false);
  });
});
