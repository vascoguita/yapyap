export interface ErrorSource {
  on(
    event: 'uncaughtException' | 'unhandledRejection',
    listener: (error: unknown) => void,
  ): unknown;
}

/** An error as the log shows it: its stack where it has one. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  // Any other value could carry what a chat said, so only its kind is logged.
  return typeof error === 'string' ? error : Object.prototype.toString.call(error);
}

/**
 * Electron shows an uncaught main-process error in a modal box that blocks
 * the whole app, quitting included, until someone dismisses it (#223).
 * YapYap writes it to the redacted log instead and keeps running.
 */
export function logProcessErrors(source: ErrorSource, log: (message: string) => void): void {
  source.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${describeError(error)}`);
  });
  source.on('unhandledRejection', (error) => {
    log(`Unhandled rejection: ${describeError(error)}`);
  });
}
