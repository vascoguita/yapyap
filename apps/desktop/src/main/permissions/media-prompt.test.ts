import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { askMediaWithDialog } = await import('./media-prompt.ts');

const VIEW = { zone: 'whatsapp' as const, home: 'https://web.whatsapp.com', label: 'Work' };

describe('askMediaWithDialog', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('names the account and the devices, and defaults to deny', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'])).toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'question',
      title: 'YapYap',
      message: 'Work wants to use your microphone and camera.',
      detail: 'YapYap remembers your answer until you quit.',
      buttons: ['Allow', 'Deny'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('denies when the user picks Deny or closes the dialog', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await askMediaWithDialog(VIEW, ['video'])).toBe(false);
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Work wants to use your camera.' }),
    );
  });
});
