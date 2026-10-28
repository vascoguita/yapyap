import type { ExtensionHost } from '@yapyap/extension-sdk';
import { panelRequest, type AssistantState, type PanelRequest, type Update } from './bus.ts';
import { replyFlow, type FlowHost, type ReplyFlow } from './reply-flow.ts';
import { assistantSettings, keyName, missingSetting, providerFor } from './settings.ts';

type Host = Pick<ExtensionHost, 'settings' | 'secrets'>;

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

async function changeKey(host: Host, request: PanelRequest): Promise<void> {
  const { provider } = assistantSettings(await host.settings.get());
  await (request.type === 'save-key'
    ? host.secrets.set(keyName(provider), request.key)
    : host.secrets.delete(keyName(provider)));
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
  postMessage(message: Update): void;
}

/** Why a request failed, as a word the panel can explain: a host or provider error's kind. */
function reasonOf(error: unknown): string {
  const { kind } = Object(error) as { kind?: unknown };
  return typeof kind === 'string' ? kind : 'failed';
}

function run(
  host: FlowHost,
  flow: ReplyFlow,
  request: Exclude<PanelRequest, { type: 'cancel' }>,
): Promise<unknown> {
  switch (request.type) {
    case 'prepare':
      return flow.prepare({ mode: 'replies' });
    case 'prepare-summary':
      return flow.prepare({ mode: 'summary' });
    case 'prepare-rewrite':
      return flow.prepare({ mode: 'rewrite', style: request.style, language: request.language });
    case 'allow-chat':
      return flow.allow(request.allowed);
    case 'send':
      return flow.send();
    case 'use':
      return flow.use(request.index);
    default:
      return request.type === 'state?' ? Promise.resolve() : changeKey(host, request);
  }
}

/**
 * Answers the panel's requests on `channel`: the setup, saving or
 * forgetting the key, and suggested replies. Only this page can reach
 * YapYap's host API; the panel only asks.
 */
export function servePanel(
  host: FlowHost,
  channel: Channel,
  make: typeof providerFor = providerFor,
): void {
  const post = (update: Update): void => {
    channel.postMessage(update);
  };
  const flow = replyFlow(host, post, make);
  // Requests run one at a time, in the order the panel sent them; only Stop
  // goes ahead, since it must reach the request it stops.
  let queue: Promise<unknown> = Promise.resolve();
  channel.onmessage = (event) => {
    const request = panelRequest(event.data);
    if (request?.type === 'cancel') {
      flow.cancel();
      return;
    }
    if (request === undefined) {
      return;
    }
    const keyed = ['state?', 'save-key', 'forget-key'].includes(request.type);
    queue = queue
      .then(() => run(host, flow, request))
      .then(async () => {
        if (keyed) {
          post(await stateOf(host));
        }
      })
      .catch((error: unknown) => {
        post({ type: 'problem', reason: reasonOf(error) });
      });
  };
  // A panel opened before this page loaded asked into the void; it hears this.
  stateOf(host).then(post, () => {
    post(UNAVAILABLE);
  });
}
