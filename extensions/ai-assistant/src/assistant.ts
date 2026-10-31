import type { ExtensionHost } from '@yapyap/extension-sdk';
import type { LocalModel, LocalState } from './built-in/local-model.ts';
import { wordsFor } from './built-in/words.ts';
import {
  panelRequest,
  type AssistantState,
  type KeyRequest,
  type LocalView,
  type PanelRequest,
  type Update,
} from './bus.ts';
import { replyFlow, type FlowHost, type ReplyFlow } from './reply-flow.ts';
import { currentSetup, pageModels, type modelsOf, type Setup } from './models.ts';
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
export function stateOf({ settings, key }: Setup): AssistantState {
  // People who run a model know it as theirs, not as an "OpenAI-compatible server".
  const provider = usesLocalServer(settings) ? 'local' : settings.provider;
  return {
    type: 'state',
    // The private model goes without its name, which says nothing to most people (#457).
    model: provider === 'built-in' ? '' : settings.model,
    missing: missingSetting(settings, key),
    search: offersSearch(settings, key),
    provider,
  };
}

/**
 * Whether the panel offers the private model while there is none: to
 * someone who set nothing up, or who chose it in the settings (#457).
 */
const offersLocal = ({ settings, key }: Setup): boolean =>
  offersSearch(settings, key) || settings.provider === 'built-in';

/** What the panel shows about the private model. */
const localViewOf = (state: LocalState, used: number, offered: boolean): LocalView => ({
  type: 'local',
  ...wordsFor(state, offered),
  used,
  model: state.model.name,
});

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

/**
 * How long to wait first after YapYap said the extension calls too often,
 * and how often to try in all: its rate refills five calls a second.
 */
const RATE_RETRY_MS = 1000;
export const RATE_TRIES = 3;

/**
 * Runs `attempt`, and again while YapYap says the extension calls too
 * often, up to `tries` times: a burst of clicks can run past its rate, and
 * the bar or panel would otherwise wait on its answer for good. Each wait
 * doubles, since the bar and the panel retry at once and share the rate:
 * equal waits would have them run out of it together every time.
 */
export async function patiently(
  attempt: () => Promise<void>,
  tries: number,
  wait = RATE_RETRY_MS,
): Promise<void> {
  try {
    await attempt();
  } catch (error) {
    if (tries <= 1 || reasonOf(error) !== 'rate-limited') {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
    await patiently(attempt, tries - 1, wait * 2);
  }
}

/** What the panel's side of the page works with. */
interface Panel {
  readonly host: PanelHost;
  readonly flow: ReplyFlow;
  readonly local: LocalModel;
  readonly post: (update: Update) => void;
}

function run(panel: Panel, request: Exclude<PanelRequest, { type: 'cancel' }>): Promise<unknown> {
  const { flow } = panel;
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
      return setUp(panel, request);
  }
}

/** The private model's buttons in the panel (#457). */
const LOCAL: Readonly<Record<string, (local: LocalModel) => Promise<void>>> = {
  'download-model': (local) => local.download(),
  'smaller-model': (local) => local.smaller(),
  'remove-model': (local) => local.remove(),
};

/** The panel's requests about the setup itself, which need no chat. */
function setUp(
  { host, local, post }: Panel,
  request: Extract<PanelRequest, { type: SetupRequest }>,
): Promise<void> {
  if (request.type === 'find-model') {
    return search(host, post);
  }
  const action = LOCAL[request.type];
  if (action !== undefined) {
    return action(local);
  }
  return request.type === 'state?' ? Promise.resolve() : changeKey(host, request);
}

type SetupRequest =
  | 'state?'
  | 'save-key'
  | 'forget-key'
  | 'find-model'
  | 'download-model'
  | 'smaller-model'
  | 'remove-model';

const SETUP_REQUESTS: ReadonlySet<string> = new Set<SetupRequest>([
  'state?',
  'save-key',
  'forget-key',
  'find-model',
  'download-model',
  'smaller-model',
  'remove-model',
]);

/** The key request a state answers, so the panel stops sending it again. */
const answerTo = ({ type }: PanelRequest): KeyRequest | undefined =>
  type === 'save-key' || type === 'forget-key' ? type : undefined;

/**
 * Tells the panel the setup and how the private model stands; returns
 * whether the panel should offer the private model while there is none.
 */
async function postState(
  panel: Panel,
  list: typeof modelsOf,
  answers: KeyRequest | undefined,
): Promise<boolean> {
  const setup = await currentSetup(panel.host, list);
  panel.post({ ...stateOf(setup), ...(answers === undefined ? {} : { answers }) });
  const offered = offersLocal(setup);
  panel.post(localViewOf(await panel.local.state(), await panel.local.used(), offered));
  return offered;
}

/** Tells the panel of the download's progress and the model warming up as they happen. */
function followLocal({ local, post }: Panel, offered: () => boolean): void {
  local.onChange((state) => {
    local.used().then(
      (used) => {
        post(localViewOf(state, used, offered()));
      },
      () => undefined,
    );
  });
}

/**
 * Answers the panel's requests on `channel`: the setup, saving or
 * forgetting the key, the private model, and suggested replies. Only this
 * page can reach YapYap's host API; the panel only asks.
 */
export function servePanel(
  host: PanelHost,
  channel: Channel,
  local: LocalModel,
  {
    make = providerFor,
    list = pageModels,
  }: { make?: typeof providerFor; list?: typeof modelsOf } = {},
): void {
  const post = (update: Update): void => {
    channel.postMessage(update);
  };
  const panel: Panel = { host, local, post, flow: replyFlow(host, post, { make, list, local }) };
  let offered = false;
  // A state that YapYap's rate kept from coming would leave the panel showing the old setup.
  const refresh = (answers?: KeyRequest): Promise<void> =>
    patiently(async () => {
      offered = await postState(panel, list, answers);
    }, RATE_TRIES);
  // Requests run one at a time, in the order the panel sent them; only Stop
  // goes ahead, since it must reach the request it stops.
  let queue: Promise<unknown> = Promise.resolve();
  channel.onmessage = (event) => {
    const request = panelRequest(event.data);
    if (request?.type === 'cancel') {
      panel.flow.cancel();
      return;
    }
    if (request === undefined) {
      return;
    }
    queue = queue
      .then(() => run(panel, request))
      .then(() => (SETUP_REQUESTS.has(request.type) ? refresh(answerTo(request)) : undefined))
      .catch((error: unknown) => {
        post({ type: 'problem', reason: reasonOf(error) });
      });
  };
  followLocal(panel, () => offered);
  // A panel opened before this page loaded asked into the void; it hears this.
  refresh().catch(() => {
    post(UNAVAILABLE);
  });
}
