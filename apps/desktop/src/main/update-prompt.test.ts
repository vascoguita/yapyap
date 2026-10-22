import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { askToInstallUpdateWithDialog } = await import('./update-prompt.ts');

describe('askToInstallUpdateWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('names the version and defaults to Later', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askToInstallUpdateWithDialog('0.2.0')).toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'YapYap 0.2.0 is ready to install',
        buttons: ['Restart and Install', 'Later'],
        defaultId: 1,
        cancelId: 1,
      }),
    );
  });

  it('installs nothing when the user picks Later or closes the dialog', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await askToInstallUpdateWithDialog('0.2.0')).toBe(false);
  });
});
