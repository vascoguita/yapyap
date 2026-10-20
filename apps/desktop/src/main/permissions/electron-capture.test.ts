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

const { electronCapture, usesPortalPicker } = await import('./electron-capture.ts');

const WAYLAND = { WAYLAND_DISPLAY: 'wayland-0' };

describe('usesPortalPicker', () => {
  it('is true only for Linux sessions with a Wayland display', () => {
    expect(usesPortalPicker('linux', WAYLAND)).toBe(true);
    expect(usesPortalPicker('linux', { WAYLAND_DISPLAY: '' })).toBe(false);
    expect(usesPortalPicker('linux', {})).toBe(false);
    expect(usesPortalPicker('win32', WAYLAND)).toBe(false);
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
    expect(electronCapture('linux', {}).contentsOfFrame(frame)).toBe(contents);
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
    expect(electronCapture('linux', {}).isVisibleAndFocused(contents)).toBe(expected);
    expect(electron.fromWebContents).toHaveBeenCalledWith(contents);
  });

  it('picks with the portal on Wayland, returning the one source the user chose', async () => {
    const source = { id: 'screen:1:0', name: 'Screen' };
    electron.getSources.mockResolvedValueOnce([source]).mockResolvedValueOnce([]);
    const pick = electronCapture('linux', WAYLAND).pickWithPortal;
    expect(await pick?.()).toBe(source);
    expect(await pick?.()).toBeUndefined();
    expect(electron.getSources).toHaveBeenCalledWith({ types: ['screen', 'window'] });
  });

  it('has no portal picker elsewhere and uses the system picker only on macOS', () => {
    expect(electronCapture('win32', {}).pickWithPortal).toBeUndefined();
    expect(electronCapture('darwin', {}).useSystemPicker).toBe(true);
    expect(electronCapture('linux', WAYLAND).useSystemPicker).toBe(false);
  });
});
