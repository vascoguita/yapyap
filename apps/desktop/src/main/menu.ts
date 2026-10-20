import type { MenuItemConstructorOptions } from 'electron';
import { PRODUCT_NAME } from './identity.ts';

/**
 * The application menu: the platform's standard menus, with About opening
 * YapYap's own window instead of the stock panel.
 */
export function buildMenuTemplate(
  platform: string,
  openAbout: () => void,
): MenuItemConstructorOptions[] {
  const about: MenuItemConstructorOptions = { label: `About ${PRODUCT_NAME}`, click: openAbout };
  const standard: MenuItemConstructorOptions[] = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  if (platform !== 'darwin') return [...standard, { role: 'help', submenu: [about] }];
  const appMenu: MenuItemConstructorOptions = {
    label: PRODUCT_NAME,
    submenu: [
      about,
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
  return [appMenu, ...standard];
}
