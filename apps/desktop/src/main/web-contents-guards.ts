export interface PreventableEvent {
  preventDefault(): void;
}

export interface GuardedContents {
  on(event: 'will-attach-webview', listener: (event: PreventableEvent) => void): unknown;
}

export interface GuardedApp {
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
}

export type WebContentsGuard = (contents: GuardedContents) => void;

/** `webviewTag` is off everywhere, so an attaching `<webview>` is always an attack. */
export const preventWebviews: WebContentsGuard = (contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
};

/**
 * Applies every guard to every web contents, including ones Electron or
 * Chromium create on their own, such as DevTools and service-worker hosts.
 */
export function installWebContentsGuards(
  app: GuardedApp,
  guards: readonly WebContentsGuard[] = [preventWebviews],
): void {
  app.on('web-contents-created', (_event, contents) => {
    for (const guard of guards) guard(contents);
  });
}
