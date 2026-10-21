import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildMenuTemplate } from './menu.ts';

function actions() {
  return {
    openAbout: vi.fn(),
    openSettings: vi.fn(),
    clearCache: vi.fn(),
    resetSession: vi.fn(),
    zoom: vi.fn(),
    copyDiagnostics: vi.fn(),
  };
}

const ACCOUNT = (a: ReturnType<typeof actions>) => ({
  label: '&Account',
  submenu: [
    { label: 'Clear Cache and Reload', click: a.clearCache },
    { type: 'separator' },
    { label: 'Reset Session…', click: a.resetSession },
  ],
});

const items = (menu: MenuItemConstructorOptions | undefined) =>
  Array.isArray(menu?.submenu) ? menu.submenu : [];

describe('buildMenuTemplate', () => {
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
    for (const item of zoomItems) (item.click as () => void)();
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

  it('puts About and Settings in the app menu on macOS', () => {
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
    expect(entries.map((item) => item.role ?? item.type)).toEqual([
      undefined,
      'separator',
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
