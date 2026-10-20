import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { confirmResetWithDialog } = await import('./session-reset-prompt.ts');

describe('confirmResetWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('warns what a reset deletes and defaults to Cancel', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await confirmResetWithDialog()).toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'warning',
      title: 'YapYap',
      message: 'Reset this WhatsApp session?',
      detail:
        'This logs you out and deletes WhatsApp’s data on this computer. Your chats stay on your phone. To use WhatsApp here again, link this device again.',
      buttons: ['Reset Session', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('keeps the session when the user cancels or closes the dialog', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await confirmResetWithDialog()).toBe(false);
  });
});
