import type { MenuItemConstructorOptions } from 'electron';
import type { ZoomStep } from '../appearance/zoom.ts';
import { PRODUCT_NAME } from '../identity/product.ts';
import type { AccountSummary } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { acceleratorOf, type CustomShortcuts, type ShortcutId } from '../../shared/shortcuts.ts';

/** The platform the menu is for, and the keys the user chose instead of YapYap's. */
interface Keys {
  readonly platform: string;
  readonly custom: CustomShortcuts;
}

/** Positions with a shortcut: the digits 1 to 9. */
const SHORTCUT_POSITIONS = 9;

/** The accelerator a platform gives `id`, ready to spread into a menu item. */
function keyed(id: ShortcutId, keys: Keys): Pick<MenuItemConstructorOptions, 'accelerator'> {
  const accelerator = acceleratorOf(id, keys.platform, keys.custom);
  return accelerator === undefined ? {} : { accelerator };
}

export interface MenuActions {
  /** Every account; only those that are on can be switched to. */
  readonly accounts: readonly AccountSummary[];
  readonly switchAccount: (id: string) => void;
  readonly addAccount: () => void;
  readonly openAccounts: () => void;
  /** Asks first, since it deletes the active account's WhatsApp data. */
  readonly removeAccount: () => void;
  readonly doNotDisturb: boolean;
  readonly setDoNotDisturb: (on: boolean) => void;
  /** Mutes or unmutes the active account. */
  readonly setMuted: (muted: boolean) => void;
  readonly openAbout: () => void;
  readonly openSettings: () => void;
  /** Reloads the active account's WhatsApp, wherever the focus is. */
  readonly reload: () => void;
  readonly clearCache: () => void;
  readonly logOut: () => void;
  readonly zoom: (step: ZoomStep) => void;
  readonly privacyScreen: boolean;
  readonly togglePrivacyScreen: () => void;
  readonly openShortcuts: () => void;
  readonly openDownloads: () => void;
  /** Help → Report a Problem: the guided report (#82). */
  readonly openReport: () => void;
}

/** Zoom in YapYap's own 5% steps, kept per account. */
function zoomItems(actions: MenuActions, keys: Keys): MenuItemConstructorOptions[] {
  const step = (label: string, id: ShortcutId, zoom: ZoomStep) => ({
    label,
    ...keyed(id, keys),
    click: () => {
      actions.zoom(zoom);
    },
  });
  return [
    step(en.menu.actualSize, 'actualSize', 'reset'),
    step(en.menu.zoomIn, 'zoomIn', 'in'),
    step(en.menu.zoomOut, 'zoomOut', 'out'),
  ];
}

/**
 * The standard View menu: zoom and the privacy screen first, as people use
 * them daily, and reloading and the developer tools last.
 */
function viewMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.view,
    submenu: [
      ...zoomItems(actions, keys),
      { type: 'separator' },
      {
        label: en.menu.privacyScreen,
        type: 'checkbox',
        checked: actions.privacyScreen,
        ...keyed('privacyScreen', keys),
        click: actions.togglePrivacyScreen,
      },
      { role: 'togglefullscreen', ...keyed('fullScreen', keys) },
      { type: 'separator' },
      { label: en.menu.reload, ...keyed('reload', keys), click: actions.reload },
      { role: 'toggleDevTools', ...keyed('devTools', keys) },
    ],
  };
}

/** Editing, with each shortcut from the shared table, plain-text paste included. */
function editMenu(keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.edit,
    submenu: [
      { role: 'undo', ...keyed('undo', keys) },
      { role: 'redo', ...keyed('redo', keys) },
      { type: 'separator' },
      { role: 'cut', ...keyed('cut', keys) },
      { role: 'copy', ...keyed('copy', keys) },
      { role: 'paste', ...keyed('paste', keys) },
      { role: 'pasteAndMatchStyle', ...keyed('pastePlain', keys) },
      { role: 'selectAll', ...keyed('selectAll', keys) },
    ],
  };
}

/**
 * The window, and the Downloads window YapYap keeps for this session (#74).
 * Close is in File, where each platform puts it; Downloads stays here, where
 * Chrome has it on macOS (#710).
 */
function windowMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  const mac: MenuItemConstructorOptions[] =
    keys.platform === 'darwin' ? [{ role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : [];
  return {
    label: en.menu.window,
    // On macOS this role adds the open windows to the menu.
    ...(keys.platform === 'darwin' ? { role: 'windowMenu' as const } : {}),
    submenu: [
      { role: 'minimize', ...keyed('minimize', keys) },
      ...mac,
      { type: 'separator' },
      { label: en.menu.downloads, ...keyed('downloads', keys), click: actions.openDownloads },
    ],
  };
}

function running(actions: MenuActions): readonly AccountSummary[] {
  return actions.accounts.filter((entry) => entry.enabled);
}

/** The accounts, switched by position with Ctrl or Cmd and a digit. */
function accountItems(actions: MenuActions, keys: Keys): MenuItemConstructorOptions[] {
  const first = String(acceleratorOf('switchAccount', keys.platform, keys.custom));
  return running(actions).map((entry, index) => ({
    label: entry.name,
    type: 'radio',
    checked: entry.active,
    ...(index < SHORTCUT_POSITIONS ? { accelerator: first.replace(/1$/, String(index + 1)) } : {}),
    click: () => {
      actions.switchAccount(entry.id);
    },
  }));
}

/** Do not disturb for every account, and muting for the one on screen (#61). */
function quietItems(actions: MenuActions): MenuItemConstructorOptions[] {
  const active = actions.accounts.find((entry) => entry.active);
  const muted = active?.muted === true;
  return [
    {
      label: en.menu.doNotDisturb,
      type: 'checkbox',
      checked: actions.doNotDisturb,
      click: () => {
        actions.setDoNotDisturb(!actions.doNotDisturb);
      },
    },
    {
      label: en.menu.muteAccount,
      type: 'checkbox',
      checked: muted,
      enabled: active !== undefined,
      click: () => {
        actions.setMuted(!muted);
      },
    },
  ];
}

/**
 * Clearing the cache and resetting the session sit one level down, as they
 * are for when an account misbehaves and the last of them logs it out.
 */
function troubleshootMenu(actions: MenuActions): MenuItemConstructorOptions {
  return {
    label: en.menu.troubleshoot,
    submenu: [
      { label: en.menu.clearCache, click: actions.clearCache },
      { type: 'separator' },
      { label: en.menu.logOut, click: actions.logOut },
    ],
  };
}

/** The accounts, how loud they are, and fixes for the active one. */
function accountMenu(actions: MenuActions, keys: Keys): MenuItemConstructorOptions {
  return {
    label: en.menu.account,
    submenu: [
      ...accountItems(actions, keys),
      { type: 'separator' },
      { label: en.menu.addAccount, click: actions.addAccount },
      { label: en.menu.manageAccounts, click: actions.openAccounts },
      {
        label: en.menu.removeAccount,
        enabled: running(actions).length > 1,
        click: actions.removeAccount,
      },
      { type: 'separator' },
      ...quietItems(actions),
      { type: 'separator' },
      troubleshootMenu(actions),
    ],
  };
}

/** The items whose place differs between macOS and the other platforms. */
interface PlacedItems {
  readonly about: MenuItemConstructorOptions;
  /**
   * Settings, the user's own code included (#710). The assistant needs no
   * item: it works in the message box, and its rewrite menu opens Settings
   * at its page (ADR 0017).
   */
  readonly settings: MenuItemConstructorOptions;
  readonly close: MenuItemConstructorOptions;
  /** The shortcuts and reporting a problem, which also copies diagnostics and records traces. */
  readonly help: MenuItemConstructorOptions[];
  readonly quit: MenuItemConstructorOptions;
}

function placedItems(actions: MenuActions, keys: Keys): PlacedItems {
  return {
    about: { label: en.menu.about({ product: PRODUCT_NAME }), click: actions.openAbout },
    settings: { label: en.menu.settings, ...keyed('settings', keys), click: actions.openSettings },
    close: { role: 'close', ...keyed('close', keys) },
    help: [
      { label: en.menu.shortcuts, ...keyed('shortcuts', keys), click: actions.openShortcuts },
      { label: en.menu.reportProblem, click: actions.openReport },
    ],
    quit: { role: 'quit', ...keyed('quit', keys) },
  };
}

/**
 * The application menu: the platform's standard menus, with About opening
 * YapYap's own window instead of the stock panel. Settings and Close
 * Window sit where each platform expects them, on the conventional shortcuts.
 */
export function buildMenuTemplate(
  platform: string,
  actions: MenuActions,
  custom: CustomShortcuts = {},
): MenuItemConstructorOptions[] {
  const keys = { platform, custom };
  const placed = placedItems(actions, keys);
  const menus: MenuItemConstructorOptions[] = [
    accountMenu(actions, keys),
    editMenu(keys),
    viewMenu(actions, keys),
    windowMenu(actions, keys),
  ];
  if (platform !== 'darwin') {
    return [
      {
        label: en.menu.file,
        submenu: [placed.settings, { type: 'separator' }, placed.close, placed.quit],
      },
      ...menus,
      { role: 'help', submenu: [placed.about, { type: 'separator' }, ...placed.help] },
    ];
  }
  return [
    macAppMenu(placed, keys),
    { label: en.menu.file, submenu: [placed.close] },
    ...menus,
    { role: 'help', submenu: placed.help },
  ];
}

function macAppMenu(placed: PlacedItems, keys: Keys): MenuItemConstructorOptions {
  return {
    label: PRODUCT_NAME,
    submenu: [
      placed.about,
      { type: 'separator' },
      placed.settings,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', ...keyed('hide', keys) },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      placed.quit,
    ],
  };
}
