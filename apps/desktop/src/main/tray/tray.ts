import type { MenuItemConstructorOptions } from 'electron';
import type { AccountSummary } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { bringToFront, type LinkWindow } from '../instances.ts';

export interface TrayPort {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  /** Text beside the icon; only the macOS menu bar shows it. */
  setTitle(title: string): void;
  on(event: 'click', listener: () => void): unknown;
  setImage(image: unknown): void;
}

export interface TrayWindow extends LinkWindow {
  hide(): void;
}

export interface TrayDependencies {
  readonly platform: string;
  readonly buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  readonly switchAccount: (id: string) => void;
  readonly openSettings: () => void;
  readonly setDoNotDisturb: (on: boolean) => void;
  readonly quit: () => void;
}

/** What the tray shows; it changes with the accounts, the unread count and the window. */
export interface TrayState {
  readonly accounts: readonly AccountSummary[];
  readonly unread: number;
  readonly windowShown: boolean;
  readonly doNotDisturb: boolean;
}

/** The running accounts, when there is a choice; picking one shows it. */
function accountItems(
  state: TrayState,
  window: TrayWindow,
  deps: TrayDependencies,
): MenuItemConstructorOptions[] {
  const running = state.accounts.filter((account) => account.enabled);
  if (running.length < 2) {
    return [];
  }
  return [
    { type: 'separator' },
    ...running.map((account): MenuItemConstructorOptions => ({
      label: account.muted ? en.tray.mutedAccount(account.name) : account.name,
      type: 'radio',
      checked: account.active,
      click: () => {
        deps.switchAccount(account.id);
        bringToFront(window);
      },
    })),
  ];
}

function menuOf(
  state: TrayState,
  window: TrayWindow,
  deps: TrayDependencies,
): MenuItemConstructorOptions[] {
  const toggle: MenuItemConstructorOptions = state.windowShown
    ? {
        label: en.tray.hide,
        click: () => {
          window.hide();
        },
      }
    : {
        label: en.tray.show,
        click: () => {
          bringToFront(window);
        },
      };
  return [
    toggle,
    ...accountItems(state, window, deps),
    { type: 'separator' },
    {
      label: en.tray.doNotDisturb,
      type: 'checkbox',
      checked: state.doNotDisturb,
      click: () => {
        deps.setDoNotDisturb(!state.doNotDisturb);
      },
    },
    { label: en.tray.settings, click: deps.openSettings },
    { type: 'separator' },
    { label: en.tray.quit, click: deps.quit },
  ];
}

/**
 * The tray icon keeps YapYap reachable when its window is hidden, whether it
 * started minimized or closed to the tray, and shows the unread count of
 * every account. Some Linux desktops never deliver clicks on the icon
 * itself, so the menu offers the same action. Returns how to update it.
 */
export function setUpTray(
  tray: TrayPort,
  window: TrayWindow,
  deps: TrayDependencies,
): (state: TrayState) => void {
  // A click on the macOS menu bar item opens its menu, as menu bar items do.
  if (deps.platform !== 'darwin') {
    tray.on('click', () => {
      bringToFront(window);
    });
  }
  return (state) => {
    tray.setToolTip(state.unread > 0 ? en.tray.unread(state.unread) : en.tray.tooltip);
    if (deps.platform === 'darwin') {
      tray.setTitle(state.unread > 0 ? String(state.unread) : '');
    }
    tray.setContextMenu(deps.buildMenu(menuOf(state, window, deps)));
  };
}
