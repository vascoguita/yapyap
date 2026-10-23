import type { GlyphShade } from './symbolic-icon.ts';

/** The tray icon setting: the app icon, or a symbolic one in a shade or following the scheme. */
export type TrayIconStyle = 'color' | 'auto' | GlyphShade;

/** What the tray shows: the app icon, a symbolic one, or a macOS template image. */
export type TrayIconChoice = 'color' | GlyphShade | 'template';

/**
 * macOS colors template images to suit the menu bar itself, so every
 * symbolic choice is a template there. Elsewhere "auto" picks the shade
 * that stands out against a panel in the current scheme.
 */
export function trayIconChoice(
  style: TrayIconStyle,
  platform: string,
  darkPanel: boolean,
): TrayIconChoice {
  if (style === 'color') {
    return 'color';
  }
  if (platform === 'darwin') {
    return 'template';
  }
  if (style === 'auto') {
    return darkPanel ? 'light' : 'dark';
  }
  return style;
}
