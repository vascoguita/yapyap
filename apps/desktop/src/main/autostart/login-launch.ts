/**
 * Every login entry starts YapYap with this, so it can tell a start at login
 * from the user opening it (#699).
 */
export const LOGIN_FLAG = '--started-at-login';

export interface LoginLaunch {
  readonly argv: readonly string[];
  readonly platform: string;
  /** Whether macOS opened YapYap as a login item, whose entries take no arguments. */
  readonly wasOpenedAtLogin: () => boolean;
}

/** Whether the system started YapYap at login, rather than the user opening it. */
export function startedAtLogin(launch: LoginLaunch): boolean {
  return (
    launch.argv.includes(LOGIN_FLAG) || (launch.platform === 'darwin' && launch.wasOpenedAtLogin())
  );
}

/**
 * Start in the background (`general.startMinimized`) keeps the window hidden
 * only at login: someone who opens YapYap themselves wants to see it.
 */
export const startsHidden = (startMinimized: boolean, launch: LoginLaunch): boolean =>
  startMinimized && startedAtLogin(launch);
