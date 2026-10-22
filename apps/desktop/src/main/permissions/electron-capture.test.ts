import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  fromFrame: vi.fn(),
  fromWebContents: vi.fn(),
  getSources: vi.fn(),
}));

vi.mock('electron', () => ({
  webContents: { fromFrame: electron.fromFrame },
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  desktopCapturer: { getSources: electron.getSources },
}));

const { electronCapture, hasSystemPicker, usesPortalPicker } =
  await import('./electron-capture.ts');

describe('usesPortalPicker', () => {
  it('is true only on Linux with Chromium running natively on Wayland', () => {
    expect(usesPortalPicker('linux', true)).toBe(true);
    expect(usesPortalPicker('linux', false)).toBe(false);
    expect(usesPortalPicker('win32', true)).toBe(false);
  });
});

describe('hasSystemPicker', () => {
  it('is true from macOS 15 only', () => {
    expect(hasSystemPicker('darwin', '15.0')).toBe(true);
    expect(hasSystemPicker('darwin', '26.0.1')).toBe(true);
    expect(hasSystemPicker('darwin', '14.7.1')).toBe(false);
    expect(hasSystemPicker('win32', '15.0')).toBe(false);
  });
});

describe('electronCapture', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('finds the web contents that owns a frame', () => {
    const contents = {};
    const frame = {};
    electron.fromFrame.mockReturnValueOnce(contents);
    expect(electronCapture('linux', false, '7.0.0', vi.fn()).contentsOfFrame(frame)).toBe(contents);
    expect(electron.fromFrame).toHaveBeenCalledWith(frame);
  });

  it.each([
    [{ isVisible: () => true, isFocused: () => true }, true],
    [{ isVisible: () => false, isFocused: () => true }, false],
    [{ isVisible: () => true, isFocused: () => false }, false],
    [null, false],
  ])('reports whether the window is visible and focused (%#)', (window, expected) => {
    const contents = {};
    electron.fromWebContents.mockReturnValueOnce(window);
    expect(electronCapture('linux', false, '7.0.0', vi.fn()).isVisibleAndFocused(contents)).toBe(
      expected,
    );
    expect(electron.fromWebContents).toHaveBeenCalledWith(contents);
  });

  it('picks with the portal on Wayland, returning the one source the user chose', async () => {
    const source = { id: 'screen:1:0', name: 'Screen' };
    electron.getSources.mockResolvedValueOnce([source]).mockResolvedValueOnce([]);
    const pickInApp = vi.fn();
    const pick = electronCapture('linux', true, '7.0.0', pickInApp).pick;
    expect(await pick?.({})).toEqual({ video: source });
    expect(await pick?.({})).toBeUndefined();
    expect(electron.getSources).toHaveBeenCalledWith({ types: ['screen', 'window'] });
    expect(pickInApp).not.toHaveBeenCalled();
  });

  it.each([
    ['win32', false, '10.0.26100'],
    ['linux', false, '7.0.0'],
    ['darwin', false, '14.7.1'],
  ])('uses YapYap’s own picker on %s (Wayland: %s) %s', (platform, wayland, version) => {
    const pickInApp = vi.fn();
    const capture = electronCapture(platform, wayland, version, pickInApp);
    expect(capture.pick).toBe(pickInApp);
    expect(capture.useSystemPicker).toBe(false);
  });

  it('leaves picking to the system on macOS 15 and later', () => {
    const capture = electronCapture('darwin', false, '15.1.0', vi.fn());
    expect(capture.pick).toBeUndefined();
    expect(capture.useSystemPicker).toBe(true);
  });
});
