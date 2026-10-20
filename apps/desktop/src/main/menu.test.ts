import { describe, expect, it, vi } from 'vitest';
import { buildMenuTemplate } from './menu.ts';

describe('buildMenuTemplate', () => {
  it('puts About in the Help menu on Windows and Linux', () => {
    const openAbout = vi.fn();
    const template = buildMenuTemplate('linux', openAbout);
    expect(template.map((item) => item.role)).toEqual([
      'fileMenu',
      'editMenu',
      'viewMenu',
      'windowMenu',
      'help',
    ]);
    const help = template.at(-1)?.submenu;
    expect(help).toEqual([{ label: 'About YapYap', click: openAbout }]);
  });

  it('puts About first in the app menu on macOS', () => {
    const openAbout = vi.fn();
    const [appMenu, ...rest] = buildMenuTemplate('darwin', openAbout);
    expect(appMenu?.label).toBe('YapYap');
    expect(Array.isArray(appMenu?.submenu) ? appMenu.submenu[0] : undefined).toEqual({
      label: 'About YapYap',
      click: openAbout,
    });
    expect(Array.isArray(appMenu?.submenu) ? appMenu.submenu.map((item) => item.role) : []).toEqual(
      [
        undefined,
        undefined,
        'services',
        undefined,
        'hide',
        'hideOthers',
        'unhide',
        undefined,
        'quit',
      ],
    );
    expect(rest.map((item) => item.role)).toEqual([
      'fileMenu',
      'editMenu',
      'viewMenu',
      'windowMenu',
    ]);
  });
});
