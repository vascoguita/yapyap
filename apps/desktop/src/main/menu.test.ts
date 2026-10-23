import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { AccountSummary } from '../shared/chrome-api.ts';
import { buildMenuTemplate } from './menu.ts';

function actions(accounts: AccountSummary[] = []) {
  return {
    accounts,
    switchAccount: vi.fn(),
    addAccount: vi.fn(),
    openAccounts: vi.fn(),
    removeAccount: vi.fn(),
    doNotDisturb: false,
    setDoNotDisturb: vi.fn(),
    setMuted: vi.fn(),
    openAbout: vi.fn(),
    openSettings: vi.fn(),
    openPlugins: vi.fn(),
    installPlugin: vi.fn(),
    openNewChat: vi.fn(),
    clearCache: vi.fn(),
    resetSession: vi.fn(),
    zoom: vi.fn(),
    copyDiagnostics: vi.fn(),
  };
}

const ACCOUNT = (a: ReturnType<typeof actions>) => ({
  label: '&Account',
  submenu: [
    { type: 'separator' },
    { label: 'Add Account', click: a.addAccount },
    { label: 'Manage Accounts…', click: a.openAccounts },
    { label: 'Remove Account…', enabled: false, click: a.removeAccount },
    { type: 'separator' },
    expect.objectContaining({ label: 'Do Not Disturb', type: 'checkbox', checked: false }),
    expect.objectContaining({
      label: 'Mute This Account',
      type: 'checkbox',
      checked: false,
      enabled: false,
    }),
    { type: 'separator' },
    { label: 'New Chat with Number…', click: a.openNewChat },
    { type: 'separator' },
    { label: 'Clear Cache and Reload', click: a.clearCache },
    { type: 'separator' },
    { label: 'Reset Session…', click: a.resetSession },
  ],
});

const items = (menu: MenuItemConstructorOptions | undefined) =>
  Array.isArray(menu?.submenu) ? menu.submenu : [];

describe('buildMenuTemplate', () => {
  it('lists the accounts by position, marks the active one and switches on click', () => {
    const accounts = Array.from({ length: 10 }, (_, index) => ({
      id: `id-${String(index)}`,
      name: `Account ${String(index + 1)}`,
      color: 'green',
      enabled: true,
      muted: false,
      active: index === 1,
    }));
    accounts.push({
      id: 'off',
      name: 'Switched off',
      color: 'red',
      enabled: false,
      muted: false,
      active: false,
    });
    const a = actions(accounts);
    const menu = buildMenuTemplate('linux', a).find((entry) => entry.label === '&Account');
    const entries = items(menu);
    expect(entries.slice(0, 2)).toEqual([
      expect.objectContaining({
        label: 'Account 1',
        type: 'radio',
        checked: false,
        accelerator: 'CmdOrCtrl+1',
      }),
      expect.objectContaining({ label: 'Account 2', checked: true, accelerator: 'CmdOrCtrl+2' }),
    ]);
    expect(entries[8]).toHaveProperty('accelerator', 'CmdOrCtrl+9');
    expect(entries[9]).not.toHaveProperty('accelerator');
    expect(entries.find((entry) => entry.label === 'Switched off')).toBeUndefined();
    entries[0]?.click?.(undefined as never, undefined, undefined as never);
    expect(a.switchAccount).toHaveBeenCalledWith('id-0');
    expect(entries.find((entry) => entry.label === 'Remove Account…')).toHaveProperty(
      'enabled',
      true,
    );
  });

  it('zooms the WhatsApp view in 5% steps from the View menu', () => {
    const a = actions();
    const view = buildMenuTemplate('linux', a).find((menu) => menu.label === '&View');
    const entries = items(view);
    expect(entries.map((item) => item.role ?? item.label ?? item.type)).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
      'Actual Size',
      'Zoom In',
      'Zoom Out',
      'separator',
      'togglefullscreen',
    ]);
    const zoomItems = entries.filter((item) => item.accelerator !== undefined);
    expect(zoomItems.map((item) => item.accelerator)).toEqual([
      'CmdOrCtrl+0',
      'CmdOrCtrl+=',
      'CmdOrCtrl+-',
    ]);
    for (const item of zoomItems) {
      (item.click as () => void)();
    }
    expect(a.zoom.mock.calls).toEqual([['reset'], ['in'], ['out']]);
  });

  it('puts Settings in the File menu and About in the Help menu on Windows and Linux', () => {
    const a = actions();
    const template = buildMenuTemplate('linux', a);
    expect(template.map((item) => item.role ?? item.label)).toEqual([
      '&File',
      '&Account',
      'editMenu',
      '&View',
      'windowMenu',
      'help',
    ]);
    expect(items(template[0])).toEqual([
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: a.openSettings },
      { label: 'Plugins…', click: a.openPlugins },
      { label: 'Install Plugin…', click: a.installPlugin },
      { type: 'separator' },
      { role: 'quit' },
    ]);
    expect(items(template.at(-1))).toEqual([
      { label: 'About YapYap', click: a.openAbout },
      { type: 'separator' },
      { label: 'Copy Diagnostics', click: a.copyDiagnostics },
    ]);
    expect(template[1]).toEqual(ACCOUNT(a));
  });

  it('turns do not disturb on and off, and mutes or unmutes the account on screen', () => {
    const entry = { id: 'a', name: 'Work', color: 'blue', enabled: true, active: true };
    const item = (a: ReturnType<typeof actions>, label: string) => {
      const found = items(buildMenuTemplate('linux', a)[1]).find((each) => each.label === label);
      if (found?.click === undefined) {
        throw new Error(`No ${label} item.`);
      }
      return { ...found, click: found.click as () => void };
    };
    const off = actions([{ ...entry, muted: false }]);
    item(off, 'Do Not Disturb').click();
    item(off, 'Mute This Account').click();
    expect(off.setDoNotDisturb).toHaveBeenCalledWith(true);
    expect(off.setMuted).toHaveBeenCalledWith(true);
    const on = { ...actions([{ ...entry, muted: true }]), doNotDisturb: true };
    const dnd = item(on, 'Do Not Disturb');
    const mute = item(on, 'Mute This Account');
    expect(dnd.checked).toBe(true);
    expect(mute).toMatchObject({ checked: true, enabled: true });
    dnd.click();
    mute.click();
    expect(on.setDoNotDisturb).toHaveBeenCalledWith(false);
    expect(on.setMuted).toHaveBeenCalledWith(false);
  });

  it('puts About, Settings and Plugins in the app menu on macOS', () => {
    const a = actions();
    const [appMenu, ...rest] = buildMenuTemplate('darwin', a);
    expect(appMenu?.label).toBe('YapYap');
    const entries = items(appMenu);
    expect(entries[0]).toEqual({ label: 'About YapYap', click: a.openAbout });
    expect(entries[2]).toEqual({
      label: 'Settings…',
      accelerator: 'CmdOrCtrl+,',
      click: a.openSettings,
    });
    expect(entries.slice(3, 5)).toEqual([
      { label: 'Plugins…', click: a.openPlugins },
      { label: 'Install Plugin…', click: a.installPlugin },
    ]);
    expect(entries.map((item) => item.role ?? item.type)).toEqual([
      undefined,
      'separator',
      undefined,
      undefined,
      undefined,
      'separator',
      'services',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'quit',
    ]);
    expect(rest.map((item) => item.role ?? item.label)).toEqual([
      'fileMenu',
      '&Account',
      'editMenu',
      '&View',
      'windowMenu',
      'help',
    ]);
    expect(items(rest.at(-1))).toEqual([{ label: 'Copy Diagnostics', click: a.copyDiagnostics }]);
    expect(rest[1]).toEqual(ACCOUNT(a));
  });
});
