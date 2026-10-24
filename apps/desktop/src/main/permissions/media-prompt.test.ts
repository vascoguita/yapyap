import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
const askForMediaAccess = vi.hoisted(() => vi.fn<(device: string) => Promise<boolean>>());
vi.mock('electron', () => ({
  dialog: { showMessageBox },
  systemPreferences: { askForMediaAccess },
}));

const { askMediaWithDialog } = await import('./media-prompt.ts');

const VIEW = { zone: 'whatsapp' as const, home: 'https://web.whatsapp.com', label: 'Work' };

describe('askMediaWithDialog', () => {
  const platform = process.platform;
  const runOn = (value: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value });
  };

  beforeEach(() => {
    showMessageBox.mockReset();
    askForMediaAccess.mockReset();
    runOn('linux');
  });

  afterEach(() => {
    runOn(platform);
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

  it('asks macOS too, once the user allows, and only then', async () => {
    runOn('darwin');
    askForMediaAccess.mockResolvedValue(true);
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await askMediaWithDialog(VIEW, ['audio'])).toBe(false);
    expect(askForMediaAccess).not.toHaveBeenCalled();
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'])).toBe(true);
    expect(askForMediaAccess.mock.calls).toEqual([['microphone'], ['camera']]);
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('denies, and says where to change it, when macOS refuses a device', async () => {
    runOn('darwin');
    askForMediaAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    showMessageBox.mockResolvedValue({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'])).toBe(false);
    expect(showMessageBox).toHaveBeenLastCalledWith({
      type: 'warning',
      title: 'YapYap',
      message: 'macOS does not let YapYap use your camera.',
      detail: 'Allow YapYap in System Settings → Privacy & Security, then try again.',
    });
  });

  it('leaves the system out on other platforms', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio'])).toBe(true);
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });
});
