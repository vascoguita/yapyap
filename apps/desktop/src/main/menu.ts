import type { MenuItemConstructorOptions } from 'electron';
import { PRODUCT_NAME } from './identity.ts';

export interface MenuActions {
  readonly openAbout: () => void;
  readonly openSettings: () => void;
  readonly clearCache: () => void;
  readonly resetSession: () => void;
}

/** Maintenance for the WhatsApp account, for when it misbehaves. */
function accountMenu(actions: MenuActions): MenuItemConstructorOptions {
  return {
    label: '&Account',
    submenu: [
      { label: 'Clear Cache and Reload', click: actions.clearCache },
      { type: 'separator' },
      { label: 'Reset Session…', click: actions.resetSession },
    ],
  };
}

/**
 * The application menu: the platform's standard menus, with About opening
 * YapYap's own window instead of the stock panel. Settings sits where each
 * platform expects it, on the conventional shortcut.
 */
export function buildMenuTemplate(
  platform: string,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const about: MenuItemConstructorOptions = {
    label: `About ${PRODUCT_NAME}`,
    click: actions.openAbout,
  };
  const settings: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: actions.openSettings,
  };
  const standard: MenuItemConstructorOptions[] = [
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  if (platform !== 'darwin') {
    const file: MenuItemConstructorOptions = {
      label: '&File',
      submenu: [settings, { type: 'separator' }, { role: 'quit' }],
    };
    return [file, accountMenu(actions), ...standard, { role: 'help', submenu: [about] }];
  }
  return [macAppMenu(about, settings), { role: 'fileMenu' }, accountMenu(actions), ...standard];
}

function macAppMenu(
  about: MenuItemConstructorOptions,
  settings: MenuItemConstructorOptions,
): MenuItemConstructorOptions {
  return {
    label: PRODUCT_NAME,
    submenu: [
      about,
      { type: 'separator' },
      settings,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}
