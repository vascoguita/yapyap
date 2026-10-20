/** Electron has no online/offline event in the main process, so it is polled. */
export const CONNECTIVITY_POLL_MS = 5000;

/** After waking from sleep, the network usually needs a moment to come back. */
export const RESUME_RECONNECT_MS = 3000;

export interface ConnectivityDependencies {
  readonly isOnline: () => boolean;
  readonly onResume: (listener: () => void) => void;
  readonly every: (callback: () => void, ms: number) => unknown;
  readonly schedule: (callback: () => void, ms: number) => unknown;
  /** Shows or hides the offline indicator. */
  readonly onChange: (online: boolean) => void;
  /** Reloads a view that failed while the network was gone. */
  readonly reconnect: () => void;
}

export function watchConnectivity(deps: ConnectivityDependencies): void {
  let online = deps.isOnline();
  if (!online) deps.onChange(false);
  deps.every(() => {
    const now = deps.isOnline();
    if (now === online) return;
    online = now;
    deps.onChange(now);
    if (now) deps.reconnect();
  }, CONNECTIVITY_POLL_MS);
  deps.onResume(() => {
    deps.schedule(deps.reconnect, RESUME_RECONNECT_MS);
  });
}
