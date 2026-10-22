import type { MenuItemConstructorOptions } from 'electron';
import type { ZoomStep } from './appearance/zoom.ts';
import { PRODUCT_NAME } from './identity.ts';
import { en } from '../shared/messages/en.ts';

export interface MenuActions {
  readonly openAbout: () => void;
  readonly openSettings: () => void;
  readonly openNewChat: () => void;
  readonly clearCache: () => void;
  readonly resetSession: () => void;
  readonly zoom: (step: ZoomStep) => void;
  /** Copies versions, platform, GPU summary and recent redacted log lines for bug reports. */
  readonly copyDiagnostics: () => void;
}

/** The standard View menu, with zoom in YapYap's own 5% steps, kept per account. */
function viewMenu(actions: MenuActions): MenuItemConstructorOptions {
  return {
    label: en.menu.view,
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: en.menu.actualSize,
        accelerator: 'CmdOrCtrl+0',
        click: () => {
          actions.zoom('reset');
        },
      },
      {
        label: en.menu.zoomIn,
        accelerator: 'CmdOrCtrl+=',
        click: () => {
          actions.zoom('in');
        },
      },
      {
        label: en.menu.zoomOut,
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          actions.zoom('out');
        },
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}

/** Maintenance for the WhatsApp account, for when it misbehaves. */
function accountMenu(actions: MenuActions): MenuItemConstructorOptions {
  return {
    label: en.menu.account,
    submenu: [
      { label: en.menu.newChat, click: actions.openNewChat },
      { type: 'separator' },
      { label: en.menu.clearCache, click: actions.clearCache },
      { type: 'separator' },
      { label: en.menu.resetSession, click: actions.resetSession },
    ],
  };
}

/**
 * The application menu: the platform's standard menus, with About opening
 * YapYap's own window instead of the stock panel. Settings sits where each
 * platform expects it, on the conventional shortcut.
 */
function commonItems(
  actions: MenuActions,
): Record<'about' | 'settings' | 'diagnostics', MenuItemConstructorOptions> {
  const about: MenuItemConstructorOptions = {
    label: en.menu.about(PRODUCT_NAME),
    click: actions.openAbout,
  };
  const diagnostics: MenuItemConstructorOptions = {
    label: en.menu.copyDiagnostics,
    click: actions.copyDiagnostics,
  };
  const settings: MenuItemConstructorOptions = {
    label: en.menu.settings,
    accelerator: 'CmdOrCtrl+,',
    click: actions.openSettings,
  };
  return { about, settings, diagnostics };
}

export function buildMenuTemplate(
  platform: string,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const { about, settings, diagnostics } = commonItems(actions);
  const standard: MenuItemConstructorOptions[] = [
    { role: 'editMenu' },
    viewMenu(actions),
    { role: 'windowMenu' },
  ];
  if (platform !== 'darwin') {
    const file: MenuItemConstructorOptions = {
      label: en.menu.file,
      submenu: [settings, { type: 'separator' }, { role: 'quit' }],
    };
    return [
      file,
      accountMenu(actions),
      ...standard,
      { role: 'help', submenu: [about, { type: 'separator' }, diagnostics] },
    ];
  }
  return [
    macAppMenu(about, settings),
    { role: 'fileMenu' },
    accountMenu(actions),
    ...standard,
    { role: 'help', submenu: [diagnostics] },
  ];
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
