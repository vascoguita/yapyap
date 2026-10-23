import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { autostartEntry, quoteExecArgument, xdgAutostart } from './xdg-autostart.ts';

const homes: string[] = [];

function setup(env: Record<string, string | undefined> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'yapyap-xdg-'));
  homes.push(home);
  const autostart = xdgAutostart({
    env,
    home,
    execPath: '/opt/YapYap/yapyap',
    files: {
      exists: existsSync,
      mkdir: (path) => {
        mkdirSync(path, { recursive: true });
      },
      write: (path, text) => {
        writeFileSync(path, text);
      },
      remove: (path) => {
        rmSync(path);
      },
    },
  });
  return { home, autostart };
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('quoteExecArgument', () => {
  it('quotes the argument and escapes what the specification reserves', () => {
    expect(quoteExecArgument('/opt/Yap Yap/yapyap')).toBe('"/opt/Yap Yap/yapyap"');
    expect(quoteExecArgument(String.raw`/a"b` + '`c$d\\e%f')).toBe(String.raw`"/a\"b\`c\$d\\e%%f"`);
  });
});

describe('autostartEntry', () => {
  it('starts the program under YapYap’s name and icon', () => {
    expect(autostartEntry('/opt/YapYap/yapyap')).toBe(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=YapYap',
        'Exec="/opt/YapYap/yapyap"',
        'Icon=org.guita.YapYap',
        'X-GNOME-Autostart-enabled=true',
        '',
      ].join('\n'),
    );
  });
});

describe('xdgAutostart', () => {
  it('writes and removes the entry in ~/.config/autostart', () => {
    const { home, autostart } = setup();
    const entry = join(home, '.config', 'autostart', 'org.guita.YapYap.desktop');
    expect(autostart.enabled()).toBe(false);
    autostart.enable();
    expect(autostart.enabled()).toBe(true);
    expect(readFileSync(entry, 'utf8')).toContain('Exec="/opt/YapYap/yapyap"');
    autostart.disable();
    expect(existsSync(entry)).toBe(false);
  });

  it('turns off quietly when there is no entry', () => {
    const { autostart } = setup();
    expect(() => {
      autostart.disable();
    }).not.toThrow();
  });

  it('honours an absolute XDG_CONFIG_HOME and ignores a relative one', () => {
    const config = mkdtempSync(join(tmpdir(), 'yapyap-config-'));
    homes.push(config);
    setup({ XDG_CONFIG_HOME: config }).autostart.enable();
    expect(existsSync(join(config, 'autostart', 'org.guita.YapYap.desktop'))).toBe(true);
    const relative = setup({ XDG_CONFIG_HOME: 'config' });
    relative.autostart.enable();
    expect(existsSync(join(relative.home, '.config', 'autostart'))).toBe(true);
  });

  it('starts the AppImage itself rather than its temporary mount', () => {
    const { home, autostart } = setup({ APPIMAGE: '/home/u/Apps/YapYap.AppImage' });
    autostart.enable();
    const entry = join(home, '.config', 'autostart', 'org.guita.YapYap.desktop');
    expect(readFileSync(entry, 'utf8')).toContain('Exec="/home/u/Apps/YapYap.AppImage"');
  });

  it('ignores an empty APPIMAGE', () => {
    const { home, autostart } = setup({ APPIMAGE: '' });
    autostart.enable();
    const entry = join(home, '.config', 'autostart', 'org.guita.YapYap.desktop');
    expect(readFileSync(entry, 'utf8')).toContain('Exec="/opt/YapYap/yapyap"');
  });
});
