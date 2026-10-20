import { ADAPTER_WORLD_ID, PAGE_HEALTH_PROBE, parsePageHealth } from '../../adapter/page-health.ts';
import { healthFailure, loadFailure, type Failure } from './failure.ts';

/**
 * WhatsApp shows its own loading screen first; the page is checked once it
 * has had time to replace that with the app or with an error page.
 */
export const HEALTH_CHECK_MS = 8000;

export interface MonitoredContents {
  on(
    event: 'did-fail-load',
    listener: (
      event: unknown,
      code: number,
      description: string,
      url: string,
      isMainFrame: boolean,
    ) => void,
  ): unknown;
  on(event: 'did-finish-load', listener: () => void): unknown;
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
}

export interface MonitorDependencies {
  readonly onFailure: (failure: Failure) => void;
  readonly schedule: (callback: () => void, ms: number) => unknown;
  readonly warn: (message: string) => void;
}

/** Reports load failures, unsupported-browser pages and blank pages. */
export function monitorPage(contents: MonitoredContents, deps: MonitorDependencies): void {
  const report = (failure: Failure | undefined): void => {
    if (failure !== undefined) deps.onFailure(failure);
  };
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    report(loadFailure(code, description, isMainFrame));
  });
  contents.on('did-finish-load', () => {
    deps.schedule(() => {
      contents
        .executeJavaScriptInIsolatedWorld(ADAPTER_WORLD_ID, [{ code: PAGE_HEALTH_PROBE }])
        .then(
          (value) => {
            report(healthFailure(parsePageHealth(value)));
          },
          () => {
            deps.warn('Could not check the WhatsApp page.');
          },
        );
    }, HEALTH_CHECK_MS);
  });
}
