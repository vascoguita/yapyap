import type { ExtensionHost } from '@yapyap/extension-sdk';
import { request, type Request, type Status } from './bus.ts';

/** The channel to the panel, as the hidden page uses it. */
export interface Port {
  readonly postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
}

type Host = Pick<ExtensionHost, 'calls' | 'commands'>;

async function statusOf(host: Host): Promise<Status> {
  const [state, recordings] = await Promise.all([host.calls.state(), host.calls.recordings()]);
  return { type: 'status', ...state, recordings };
}

async function handle(host: Host, asked: Request): Promise<void> {
  switch (asked.type) {
    case 'record':
      // YapYap asks the user in a window of its own; nothing records until they click Record.
      await host.calls.record();
      return;
    case 'stop':
      await host.calls.stop();
      return;
    case 'reveal':
      await host.calls.reveal(asked.id);
      return;
    case 'status?':
      return;
  }
}

/**
 * The hidden page: the commands ask YapYap to record or stop, and the panel's
 * requests do the same, each answered with the status as it now is.
 */
export function serve(host: Host, port: Port): void {
  const answer = (): Promise<void> =>
    statusOf(host).then((status) => {
      port.postMessage(status);
    });
  host.commands.onRun('record', async () => {
    await host.calls.record();
    await answer();
  });
  host.commands.onRun('stop', async () => {
    await host.calls.stop();
    await answer();
  });
  port.onmessage = ({ data }) => {
    const asked = request(data);
    if (asked !== undefined) {
      // A refused request still gets the status, so the panel never waits on it.
      void handle(host, asked)
        .catch(() => undefined)
        .then(answer);
    }
  };
}
