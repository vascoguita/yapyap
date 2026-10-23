import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { confirmRemoveAccountWithDialog } = await import('./account-removal-prompt.ts');

describe('confirmRemoveAccountWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('names the account, warns what removing deletes and defaults to Cancel', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await confirmRemoveAccountWithDialog('Work')).toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'warning',
      title: 'YapYap',
      message: 'Remove Work?',
      detail:
        'This logs the account out and deletes its WhatsApp data on this computer. Its chats stay on your phone.',
      buttons: ['Remove Account', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('keeps the account when the user cancels or closes the dialog', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await confirmRemoveAccountWithDialog('Work')).toBe(false);
  });
});
