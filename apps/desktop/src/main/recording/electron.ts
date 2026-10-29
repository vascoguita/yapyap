import type { WebFrameMain } from 'electron';
import { en } from '../../shared/messages/en.ts';
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

/** What the consent warning's message box answers. */
interface MessageBoxAnswer {
  readonly response: number;
  readonly checkboxChecked: boolean;
}

/**
 * Shows the consent warning (ADR 0015): the user confirms only by ticking
 * that they know the law and will ask, and choosing **Record**.
 */
export async function askRecordingConsent(
  show: (options: {
    readonly type: 'warning';
    readonly message: string;
    readonly detail: string;
    readonly checkboxLabel: string;
    readonly buttons: string[];
    readonly defaultId: number;
    readonly cancelId: number;
  }) => Promise<MessageBoxAnswer>,
): Promise<boolean> {
  const text = en.recording.consent;
  const { response, checkboxChecked } = await show({
    type: 'warning',
    message: text.message,
    detail: text.detail,
    checkboxLabel: text.checkbox,
    buttons: [text.record, text.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0 && checkboxChecked;
}
