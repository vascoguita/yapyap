import {
  presentAsChrome,
  type ChromeIdentity,
  type IdentitySession,
} from './identity/user-agent.ts';
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
  on(event: 'session-created', listener: (session: GuardedSession) => void): unknown;
}

export type GuardedSession = SessionPort &
  IdentitySession & {
    setSpellCheckerEnabled(enabled: boolean): void;
    setSpellCheckerLanguages(languages: string[]): void;
  };

export interface SecurityDependencies extends SessionGuardDependencies {
  readonly identity: ChromeIdentity;
}

/** Applies the permission policy and the Chrome identity to one session. */
export function secureSession(session: GuardedSession, deps: SecurityDependencies): void {
  guardSession(session, deps);
  presentAsChrome(session, deps.identity);
  // Every window makes Chromium fetch a spelling dictionary for the UI
  // language from a Google CDN, which reveals that language and the user's
  // IP address. Only an empty language list stops it; disabling the
  // spellchecker alone does not. Spell checking returns with explicit
  // language choices in #73.
  session.setSpellCheckerEnabled(false);
  session.setSpellCheckerLanguages([]);
}

/**
 * Installs every guard from ADR 0001 on every web contents and every session
 * created from now on. The default session must also be passed to
 * {@link secureSession} once the app is ready.
 */
export function installSecurity(app: SecurityApp, deps: SecurityDependencies): void {
  const navigation = createNavigationGuard({
    homeOf: (contents) => deps.views.get(contents)?.home,
    openExternal: deps.openExternal,
    popupPreferences: () => rendererPreferences(),
    inherit: (popup, opener) => {
      const info = deps.views.get(opener);
      if (info !== undefined) {
        deps.views.set(popup, info);
      }
    },
    warn: deps.warn,
    schedule: (callback, ms) => setTimeout(callback, ms),
  });
  installWebContentsGuards<GuardedContents>(app, [
    preventWebviews,
    refuseBluetoothDevices,
    navigation,
  ]);
  app.on('session-created', (session) => {
    secureSession(session, deps);
  });
}
