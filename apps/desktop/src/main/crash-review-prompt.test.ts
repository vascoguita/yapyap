import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { reviewCrashWithDialog } = await import('./crash-review-prompt.ts');

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
    await expect(reviewCrashWithDialog('the report')).resolves.toBe(choice);
  });

  it('shows the whole report and closes by default', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 2 });
    await reviewCrashWithDialog('the report');
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        buttons: ['Report on GitHub…', 'Copy Report', 'Close'],
        defaultId: 2,
        cancelId: 2,
        detail: expect.stringMatching(
          /has not been sent anywhere[\s\S]*\n\nthe report$/,
        ) as unknown,
      }),
    );
  });
});
