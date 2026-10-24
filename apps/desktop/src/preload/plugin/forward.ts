import { PLUGIN_PORT_CHANNEL } from '../../shared/plugin-rpc.ts';

export interface PortSource {
  once(
    channel: string,
    listener: (event: { readonly ports: readonly MessagePort[] }) => void,
  ): void;
}

export interface PortTarget {
  postMessage(message: string, targetOrigin: string, transfer: MessagePort[]): void;
  readonly location: { readonly origin: string };
}

/**
 * Hands the plugin's page the one MessagePort YapYap sends, and nothing
 * else: the page never sees IPC (ADR 0004). A second port is ignored.
 */
export function forwardPort(source: PortSource, target: PortTarget): void {
  source.once(PLUGIN_PORT_CHANNEL, ({ ports: [port] }) => {
    if (port !== undefined) {
      target.postMessage(PLUGIN_PORT_CHANNEL, target.location.origin, [port]);
    }
  });
}
