export interface PreventableEvent {
  preventDefault(): void;
}

export interface WebviewContents {
  on(event: 'will-attach-webview', listener: (event: PreventableEvent) => void): unknown;
}

export interface GuardedApp<Contents> {
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: Contents) => void,
  ): unknown;
}

/** `webviewTag` is off everywhere, so an attaching `<webview>` is always an attack. */
export function preventWebviews(contents: WebviewContents): void {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

/**
 * Applies every guard to every web contents, including ones Electron or
 * Chromium create on their own, such as popups and DevTools.
 */
export function installWebContentsGuards<Contents>(
  app: GuardedApp<Contents>,
  guards: readonly ((contents: Contents) => void)[],
): void {
  app.on('web-contents-created', (_event, contents) => {
    for (const guard of guards) guard(contents);
  });
}
