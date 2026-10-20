import { createNavigationGuard, type NavigationContents } from './navigation/navigation-guard.ts';
import {
  guardSession,
  type SessionGuardDependencies,
  type SessionPort,
} from './permissions/session-guard.ts';
import {
  installWebContentsGuards,
  preventWebviews,
  refuseBluetoothDevices,
  type BluetoothContents,
  type WebviewContents,
} from './web-contents-guards.ts';
import { rendererPreferences } from './web-preferences.ts';

export type GuardedContents = WebviewContents & BluetoothContents & NavigationContents;

export interface SecurityApp {
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
  on(event: 'session-created', listener: (session: SessionPort) => void): unknown;
}

export type SecurityDependencies = SessionGuardDependencies;

/**
 * Installs every guard from ADR 0001 on every web contents and every session
 * created from now on. The default session must also be passed to
 * {@link guardSession} once the app is ready.
 */
export function installSecurity(app: SecurityApp, deps: SecurityDependencies): void {
  const navigation = createNavigationGuard({
    homeOf: (contents) => deps.views.get(contents)?.home,
    openExternal: deps.openExternal,
    popupPreferences: () => rendererPreferences(),
    warn: deps.warn,
    schedule: (callback, ms) => setTimeout(callback, ms),
  });
  installWebContentsGuards<GuardedContents>(app, [
    preventWebviews,
    refuseBluetoothDevices,
    navigation,
  ]);
  app.on('session-created', (session) => {
    guardSession(session, deps);
  });
}

export { guardSession };
