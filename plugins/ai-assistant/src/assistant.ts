import type { PluginHost } from '@yapyap/plugin-sdk';
import { panelRequest, type AssistantState, type PanelRequest } from './bus.ts';
import { assistantSettings, keyName, missingSetting } from './settings.ts';

type Host = Pick<PluginHost, 'settings' | 'secrets'>;

/** The setup as the panel shows it: never the key itself, only whether there is one. */
export async function stateOf(host: Host): Promise<AssistantState> {
  const settings = assistantSettings(await host.settings.get());
  const key = await host.secrets.get(keyName(settings.provider));
  return {
    type: 'state',
    provider: settings.provider,
    model: settings.model,
    missing: missingSetting(settings, key),
  };
}

async function handle(host: Host, request: PanelRequest): Promise<AssistantState> {
  if (request.type !== 'state?') {
    const { provider } = assistantSettings(await host.settings.get());
    await (request.type === 'save-key'
      ? host.secrets.set(keyName(provider), request.key)
      : host.secrets.delete(keyName(provider)));
  }
  return stateOf(host);
}

/** What the panel is told when this page could not reach YapYap's settings or secrets. */
const UNAVAILABLE: AssistantState = {
  type: 'state',
  provider: '',
  model: '',
  missing: 'unavailable',
};

/** The port the panel's requests arrive on and its answers leave by. */
export interface Channel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

/**
 * Answers the panel's requests on `channel`: the setup, and saving or
 * forgetting the key for the chosen provider, which only this page can
 * reach through YapYap's secrets API.
 */
export function servePanel(host: Host, channel: Channel): void {
  channel.onmessage = (event) => {
    const request = panelRequest(event.data);
    if (request === undefined) {
      return;
    }
    handle(host, request).then(
      (state) => {
        channel.postMessage(state);
      },
      () => {
        channel.postMessage(UNAVAILABLE);
      },
    );
  };
  // A panel opened before this page loaded asked into the void; it hears this.
  stateOf(host).then(
    (state) => {
      channel.postMessage(state);
    },
    () => {
      channel.postMessage(UNAVAILABLE);
    },
  );
}
