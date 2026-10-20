import { createNavigationGuard, type NavigationContents } from './navigation/navigation-guard.ts';
import {
  installWebContentsGuards,
  preventWebviews,
  type GuardedApp,
  type WebviewContents,
} from './web-contents-guards.ts';
import { rendererPreferences } from './web-preferences.ts';

export type GuardedContents = WebviewContents & NavigationContents;

export interface SecurityDependencies {
  /** The origin each YapYap-created web contents belongs to. */
  readonly homes: WeakMap<object, string>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly warn: (message: string) => void;
}

/** Installs every per-web-contents guard from ADR 0001. */
export function secureAllWebContents(
  app: GuardedApp<GuardedContents>,
  { homes, openExternal, warn }: SecurityDependencies,
): void {
  const navigation = createNavigationGuard({
    homeOf: (contents) => homes.get(contents),
    openExternal,
    popupPreferences: () => rendererPreferences(),
    warn,
    schedule: (callback, ms) => setTimeout(callback, ms),
  });
  installWebContentsGuards(app, [preventWebviews, navigation]);
}
