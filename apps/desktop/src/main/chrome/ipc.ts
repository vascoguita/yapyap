import { isSameOrigin } from '../navigation/link-policy.ts';
import type { ViewRegistry } from '../views.ts';
import { CHROME_ORIGIN } from './assets.ts';

export interface IpcInvokeEvent {
  readonly sender: object;
  readonly senderFrame: { readonly url: string } | null;
}

export interface IpcMainPort {
  handle(channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => unknown): void;
}

/** Who called, so an operation can act on the caller's own window. */
export interface ChromeCall {
  readonly sender: object;
}

export interface ChromeHandler {
  readonly channel: string;
  /** Rejects any payload the operation does not expect. */
  readonly accepts: (args: readonly unknown[]) => boolean;
  readonly handle: (call: ChromeCall, ...args: unknown[]) => unknown;
}

/** For operations that take no arguments. */
export const NO_ARGUMENTS = (args: readonly unknown[]): boolean => args.length === 0;

function fromChrome(event: IpcInvokeEvent, views: ViewRegistry): boolean {
  const frameUrl = event.senderFrame?.url ?? '';
  return views.get(event.sender)?.zone === 'chrome' && isSameOrigin(frameUrl, CHROME_ORIGIN);
}

/**
 * Registers chrome operations so that each call must come from an app chrome
 * frame on `app://chrome` and carry a payload the operation accepts.
 * Rejections are logged without the payload.
 */
export function registerChromeHandlers(
  ipc: IpcMainPort,
  views: ViewRegistry,
  handlers: readonly ChromeHandler[],
  warn: (message: string) => void,
): void {
  for (const { channel, accepts, handle } of handlers) {
    ipc.handle(channel, (event, ...args) => {
      if (!fromChrome(event, views) || !accepts(args)) {
        warn(`Rejected an IPC call on ${channel}.`);
        throw new Error(`Rejected an IPC call on ${channel}.`);
      }
      return handle({ sender: event.sender }, ...args);
    });
  }
}
