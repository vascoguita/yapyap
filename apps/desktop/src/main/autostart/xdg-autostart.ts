import { isAbsolute, join } from 'node:path';
import { APP_ID, PRODUCT_NAME } from '../identity.ts';
import type { AutostartPort } from './autostart.ts';

interface XdgFiles {
  readonly exists: (path: string) => boolean;
  readonly mkdir: (path: string) => void;
  readonly write: (path: string, text: string) => void;
  readonly remove: (path: string) => void;
}

export interface XdgAutostartOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  readonly execPath: string;
  readonly files: XdgFiles;
}

/** Quotes an `Exec` argument as the Desktop Entry Specification requires. */
export function quoteExecArgument(argument: string): string {
  const escaped = argument.replaceAll(/["`$\\]/g, String.raw`\$&`).replaceAll('%', '%%');
  return `"${escaped}"`;
}

/** The autostart entry; desktops read only these keys from it. */
export function autostartEntry(executable: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${PRODUCT_NAME}`,
    `Exec=${quoteExecArgument(executable)}`,
    `Icon=${APP_ID}`,
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** Autostart through `$XDG_CONFIG_HOME/autostart`, which Linux desktops read at login. */
export function xdgAutostart(options: XdgAutostartOptions): AutostartPort {
  const configured = options.env['XDG_CONFIG_HOME'];
  // The specification says to ignore a relative or empty value.
  const configHome =
    configured !== undefined && isAbsolute(configured) ? configured : join(options.home, '.config');
  const dir = join(configHome, 'autostart');
  const path = join(dir, `${APP_ID}.desktop`);
  // An AppImage runs from a mount that changes every launch; start the image itself.
  const appImage = options.env['APPIMAGE'] ?? '';
  const executable = appImage === '' ? options.execPath : appImage;
  const { files } = options;
  return {
    enabled: () => files.exists(path),
    enable: () => {
      files.mkdir(dir);
      files.write(path, autostartEntry(executable));
    },
    disable: () => {
      if (files.exists(path)) {
        files.remove(path);
      }
    },
  };
}
