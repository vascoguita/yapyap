import type { WebFrameMain } from 'electron';
import type { ViewRegistry } from '../views.ts';
import type { CallTarget } from './recorder.ts';

/** A web contents, as finding a call window needs it. */
export interface CallContents {
  readonly mainFrame: WebFrameMain;
  isDestroyed(): boolean;
  once(event: 'destroyed', listener: () => void): unknown;
}

/**
 * The call window of the account whose WhatsApp is `main`: a call runs in
 * a window of its own, opened by the account's WhatsApp and registered with
 * the same account (#67).
 */
export function callWindowAmong(
  all: readonly CallContents[],
  main: object,
  views: ViewRegistry,
): CallTarget | undefined {
  const account = views.get(main)?.account;
  const call = all.find(
    (contents) =>
      account !== undefined &&
      contents !== main &&
      !contents.isDestroyed() &&
      views.get(contents)?.account === account,
  );
  return call === undefined
    ? undefined
    : {
        contents: call,
        frame: call.mainFrame,
        onGone: (listener) => {
          call.once('destroyed', listener);
        },
      };
}
