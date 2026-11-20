import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.hoisted(() => vi.fn());
const askForMediaAccess = vi.hoisted(() => vi.fn<(device: string) => Promise<boolean>>());
const fromWebContents = vi.hoisted(() => vi.fn<(contents: object) => object | null>(() => null));
const getFocusedWindow = vi.hoisted(() => vi.fn<() => object | null>(() => null));
vi.mock('electron', () => ({
  dialog: { showMessageBox },
  systemPreferences: { askForMediaAccess },
  BrowserWindow: { fromWebContents },
  BaseWindow: { getFocusedWindow },
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
    fromWebContents.mockReset().mockReturnValue(null);
    getFocusedWindow.mockReset().mockReturnValue(null);
    runOn('linux');
  });

  afterEach(() => {
    runOn(platform);
  });

  it('names the account and the devices, and defaults to deny', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'], null)).toBe(true);
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
    expect(await askMediaWithDialog(VIEW, ['video'], null)).toBe(false);
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Work wants to use your camera.' }),
    );
  });

  it('asks macOS too, once the user allows, and only then', async () => {
    runOn('darwin');
    askForMediaAccess.mockResolvedValue(true);
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await askMediaWithDialog(VIEW, ['audio'], null)).toBe(false);
    expect(askForMediaAccess).not.toHaveBeenCalled();
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'], null)).toBe(true);
    expect(askForMediaAccess.mock.calls).toEqual([['microphone'], ['camera']]);
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('denies, and says where to change it, when macOS refuses a device', async () => {
    runOn('darwin');
    askForMediaAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    showMessageBox.mockResolvedValue({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio', 'video'], null)).toBe(false);
    expect(showMessageBox).toHaveBeenLastCalledWith({
      type: 'warning',
      title: 'YapYap',
      message: 'macOS does not let YapYap use your camera.',
      detail: 'Allow YapYap in System Settings → Privacy & Security, then try again.',
    });
  });

  it('asks on top of the window that asked, such as a call’s, else the one in front (#724)', async () => {
    const call = { id: 'call' };
    const main = { id: 'main' };
    const contents = {};
    showMessageBox.mockResolvedValue({ response: 0 });
    fromWebContents.mockReturnValueOnce(call);
    getFocusedWindow.mockReturnValue(main);
    await askMediaWithDialog(VIEW, ['video'], contents);
    expect(fromWebContents).toHaveBeenCalledWith(contents);
    expect(showMessageBox).toHaveBeenLastCalledWith(
      call,
      expect.objectContaining({ type: 'question' }),
    );
    // An account's view has no window of its own, so the main window in front takes the question.
    await askMediaWithDialog(VIEW, ['audio'], contents);
    expect(showMessageBox).toHaveBeenLastCalledWith(
      main,
      expect.objectContaining({ type: 'question' }),
    );
    await askMediaWithDialog(VIEW, ['audio'], null);
    expect(fromWebContents).toHaveBeenCalledTimes(2);
    expect(showMessageBox).toHaveBeenLastCalledWith(
      main,
      expect.objectContaining({ type: 'question' }),
    );
  });

  it('says macOS refused on top of the same window', async () => {
    runOn('darwin');
    const call = { id: 'call' };
    fromWebContents.mockReturnValue(call);
    askForMediaAccess.mockResolvedValueOnce(false);
    showMessageBox.mockResolvedValue({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio'], {})).toBe(false);
    expect(showMessageBox).toHaveBeenLastCalledWith(
      call,
      expect.objectContaining({ type: 'warning' }),
    );
  });

  it('leaves the system out on other platforms', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    expect(await askMediaWithDialog(VIEW, ['audio'], null)).toBe(true);
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });
});
