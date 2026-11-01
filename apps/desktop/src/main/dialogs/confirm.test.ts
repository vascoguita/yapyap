import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showMessageBox } }));

const { confirm } = await import('./confirm.ts');

const QUESTION = {
  type: 'warning',
  message: 'Remove it?',
  detail: 'It is gone for good.',
  yes: 'Remove',
  no: 'Cancel',
} as const;

describe('confirm', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
  });

  it('asks under YapYap’s name, with no as the Enter and Escape answer', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    await expect(confirm(QUESTION)).resolves.toBe(true);
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith({
      type: 'warning',
      title: 'YapYap',
      message: 'Remove it?',
      detail: 'It is gone for good.',
      buttons: ['Remove', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('answers no for the second button', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(confirm(QUESTION)).resolves.toBe(false);
  });

  it('makes yes the Enter answer only when asked to, and keeps Escape on no', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    await confirm({ ...QUESTION, enterMeansYes: true });
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ defaultId: 0, cancelId: 1 }),
    );
  });

  it('attaches the box to its window', async () => {
    const parent = { id: 3 };
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    await confirm({ ...QUESTION, parent: parent as never });
    expect(showMessageBox).toHaveBeenCalledExactlyOnceWith(
      parent,
      expect.objectContaining({ message: 'Remove it?' }),
    );
  });
});
