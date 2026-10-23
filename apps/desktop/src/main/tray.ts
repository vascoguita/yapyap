import type { MenuItemConstructorOptions } from 'electron';
import { en } from '../shared/messages/en.ts';
import { bringToFront, type LinkWindow } from './instances.ts';

export interface TrayPort {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  on(event: 'click', listener: () => void): unknown;
}

export interface TrayDependencies {
  readonly buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  readonly quit: () => void;
}

/**
 * The tray icon keeps YapYap reachable when its window is hidden, whether it
 * started minimized or closed to the tray. Some Linux desktops never deliver
 * clicks on the icon itself, so the menu offers the same action.
 */
export function setUpTray(tray: TrayPort, window: LinkWindow, deps: TrayDependencies): void {
  const show = (): void => {
    bringToFront(window);
  };
  tray.setToolTip(en.tray.tooltip);
  tray.setContextMenu(
    deps.buildMenu([
      { label: en.tray.show, click: show },
      { type: 'separator' },
      { label: en.tray.quit, click: deps.quit },
    ]),
  );
  tray.on('click', show);
}
