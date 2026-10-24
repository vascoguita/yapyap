import { en } from './messages/en.ts';

/** A keyboard shortcut YapYap's menus answer to. */
export interface Shortcut {
  readonly id: ShortcutId;
  readonly label: string;
  /** Electron's accelerator; `CmdOrCtrl` is ⌘ on macOS and Ctrl elsewhere. */
  readonly accelerator: string;
  /** Where macOS uses another key, as its own apps do. */
  readonly mac?: string;
  /** The platforms (`process.platform`) that have it; all of them when absent. */
  readonly platforms?: readonly string[];
}

const text = en.shortcuts.actions;

const TABLE = [
  { id: 'settings', label: text.settings, accelerator: 'CmdOrCtrl+,' },
  { id: 'shortcuts', label: text.shortcuts, accelerator: 'CmdOrCtrl+/' },
  { id: 'switchAccount', label: text.switchAccount, accelerator: 'CmdOrCtrl+1' },
  { id: 'privacyScreen', label: text.privacyScreen, accelerator: 'CmdOrCtrl+Shift+H' },
  { id: 'zoomIn', label: text.zoomIn, accelerator: 'CmdOrCtrl+=' },
  { id: 'zoomOut', label: text.zoomOut, accelerator: 'CmdOrCtrl+-' },
  { id: 'actualSize', label: text.actualSize, accelerator: 'CmdOrCtrl+0' },
  { id: 'reload', label: text.reload, accelerator: 'CmdOrCtrl+R' },
  { id: 'forceReload', label: text.forceReload, accelerator: 'CmdOrCtrl+Shift+R' },
  { id: 'fullScreen', label: text.fullScreen, accelerator: 'F11', mac: 'Ctrl+Cmd+F' },
  { id: 'devTools', label: text.devTools, accelerator: 'CmdOrCtrl+Shift+I', mac: 'Alt+Cmd+I' },
  { id: 'undo', label: text.undo, accelerator: 'CmdOrCtrl+Z' },
  { id: 'redo', label: text.redo, accelerator: 'CmdOrCtrl+Y', mac: 'Shift+Cmd+Z' },
  { id: 'cut', label: text.cut, accelerator: 'CmdOrCtrl+X' },
  { id: 'copy', label: text.copy, accelerator: 'CmdOrCtrl+C' },
  { id: 'paste', label: text.paste, accelerator: 'CmdOrCtrl+V' },
  {
    id: 'pastePlain',
    label: text.pastePlain,
    accelerator: 'CmdOrCtrl+Shift+V',
    mac: 'Alt+Shift+Cmd+V',
  },
  { id: 'selectAll', label: text.selectAll, accelerator: 'CmdOrCtrl+A' },
  { id: 'minimize', label: text.minimize, accelerator: 'CmdOrCtrl+M' },
  { id: 'close', label: text.close, accelerator: 'CmdOrCtrl+W' },
  { id: 'hide', label: text.hide, accelerator: 'Cmd+H', platforms: ['darwin'] },
  // Windows closes apps with Alt+F4, which needs no menu item.
  { id: 'quit', label: text.quit, accelerator: 'CmdOrCtrl+Q', platforms: ['darwin', 'linux'] },
] as const;

export type ShortcutId = (typeof TABLE)[number]['id'];

/**
 * Every shortcut, in the order the Keyboard Shortcuts window lists them. The
 * menus take their accelerators from here, so the list cannot drift from them.
 */
export const SHORTCUTS: readonly Shortcut[] = TABLE;

/** The shortcuts a platform has, with its own keys. */
export function shortcutsFor(platform: string): readonly Shortcut[] {
  return SHORTCUTS.filter((shortcut) => shortcut.platforms?.includes(platform) ?? true).map(
    (shortcut) => ({
      ...shortcut,
      accelerator:
        platform === 'darwin' ? (shortcut.mac ?? shortcut.accelerator) : shortcut.accelerator,
    }),
  );
}

/** The accelerator of `id` on `platform`; undefined where the platform has none. */
export function acceleratorOf(id: ShortcutId, platform: string): string | undefined {
  return shortcutsFor(platform).find((shortcut) => shortcut.id === id)?.accelerator;
}

const MAC_KEYS: Readonly<Record<string, string>> = {
  CmdOrCtrl: '⌘',
  Cmd: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

/** The order macOS writes modifiers in; the key itself comes last. */
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];

const macRank = (key: string): number => {
  const rank = MAC_ORDER.indexOf(key);
  return rank === -1 ? MAC_ORDER.length : rank;
};

/** The keys as the platform writes them: Ctrl+Shift+H, or ⇧⌘H on macOS. */
export function keysOf(accelerator: string, platform: string): readonly string[] {
  const keys = accelerator.split('+');
  if (platform === 'darwin') {
    return keys.map((key) => MAC_KEYS[key] ?? key).toSorted((a, b) => macRank(a) - macRank(b));
  }
  return keys.map((key) => (key === 'CmdOrCtrl' ? 'Ctrl' : key));
}
