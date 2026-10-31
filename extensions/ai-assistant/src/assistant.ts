import type { ExtensionHost } from '@yapyap/extension-sdk';
import { panelRequest, type AssistantState, type PanelRequest, type Update } from './bus.ts';
import { replyFlow, type FlowHost, type ReplyFlow } from './reply-flow.ts';
import { currentSetup, pageModels, type modelsOf } from './models.ts';
import { findModel } from './find-model.ts';
import {
  assistantSettings,
  keyName,
  missingSetting,
  offersSearch,
  providerFor,
  usesLocalServer,
} from './settings.ts';

type Host = Pick<ExtensionHost, 'settings' | 'secrets' | 'storage'>;

/** What the panel's side of the page needs: the reply flow's host, and finding a model (#456). */
type PanelHost = FlowHost & Pick<ExtensionHost, 'localModels'>;

/** The setup as the panel shows it: never the key itself, only whether there is one. */
export async function stateOf(host: Host, list: typeof modelsOf): Promise<AssistantState> {
  const { settings, key } = await currentSetup(host, list);
  return {
    type: 'state',
    // People who run a model know it as theirs, not as an "OpenAI-compatible server".
    provider: usesLocalServer(settings) ? 'local' : settings.provider,
    model: settings.model,
    missing: missingSetting(settings, key),
    search: offersSearch(settings, key),
  };
}

/** Finds a model on this computer, telling the panel only when none could be used. */
async function search(host: PanelHost, post: (update: Update) => void): Promise<void> {
  const outcome = await findModel(host);
  if (outcome !== 'found') {
    post({ type: 'problem', reason: outcome });
  }
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
  search: false,
};

/** The port the panel's requests arrive on and its answers leave by. */
export interface Channel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: Update): void;
}

/** Why a request failed, as a word the panel can explain: a host or provider error's kind. */
export function reasonOf(error: unknown): string {
  const { kind } = Object(error) as { kind?: unknown };
  return typeof kind === 'string' ? kind : 'failed';
}

function run(
  host: PanelHost,
  flow: ReplyFlow,
  request: Exclude<PanelRequest, { type: 'cancel' }>,
  post: (update: Update) => void,
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
      return setUp(host, request, post);
  }
}

/** The panel's requests about the setup itself, which need no chat. */
function setUp(
  host: PanelHost,
  request: Extract<PanelRequest, { type: 'state?' | 'save-key' | 'forget-key' | 'find-model' }>,
  post: (update: Update) => void,
): Promise<void> {
  if (request.type === 'find-model') {
    return search(host, post);
  }
  return request.type === 'state?' ? Promise.resolve() : changeKey(host, request);
}

/**
 * Answers the panel's requests on `channel`: the setup, saving or
 * forgetting the key, and suggested replies. Only this page can reach
 * YapYap's host API; the panel only asks.
 */
export function servePanel(
  host: PanelHost,
  channel: Channel,
  make: typeof providerFor = providerFor,
  list: typeof modelsOf = pageModels,
): void {
  const post = (update: Update): void => {
    channel.postMessage(update);
  };
  const flow = replyFlow(host, post, make, list);
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
    const keyed = ['state?', 'save-key', 'forget-key', 'find-model'].includes(request.type);
    queue = queue
      .then(() => run(host, flow, request, post))
      .then(async () => {
        if (keyed) {
          const answers = request.type === 'save-key' || request.type === 'forget-key';
          post({ ...(await stateOf(host, list)), ...(answers ? { answers: request.type } : {}) });
        }
      })
      .catch((error: unknown) => {
        post({ type: 'problem', reason: reasonOf(error) });
      });
  };
  // A panel opened before this page loaded asked into the void; it hears this.
  stateOf(host, list).then(post, () => {
    post(UNAVAILABLE);
  });
}
