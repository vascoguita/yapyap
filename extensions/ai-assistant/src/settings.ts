import type { SettingValue } from '@yapyap/extension-sdk';
import { builtInRecord, type BuiltInRecord } from './built-in/record.ts';
import { anthropicProvider } from './providers/anthropic.ts';
import { openAIProvider } from './providers/openai.ts';
import type { Provider } from './providers/provider.ts';

/** Which service the assistant asks, as the settings form names it; `built-in` runs on this computer (#457). */
export type ProviderId = 'anthropic' | 'openai' | 'compatible' | 'built-in';

const PROVIDERS: ReadonlySet<unknown> = new Set<ProviderId>([
  'anthropic',
  'openai',
  'compatible',
  'built-in',
]);

/** What the user chose in the extension's settings form. */
export interface AssistantSettings {
  readonly provider: ProviderId;
  readonly model: string;
  /** The compatible server's address; unused for the others. */
  readonly endpoint: string;
  /** How many of the chat's latest messages to send, at most (#107). */
  readonly context: number;
  /** Only a server on this computer may be asked, so nothing leaves it (#103). */
  readonly localOnly: boolean;
  /**
   * Where the provider comes from: the user's choice in the settings form,
   * the private model the user picked (#457), the model server found on
   * this computer (#456), or the default.
   */
  readonly source: 'chosen' | 'picked' | 'found' | 'default';
  /** The private model the user picked, if any, and whether it is all downloaded. */
  readonly builtIn: BuiltInRecord | undefined;
}

/** A server on this computer, which the extension reaches with `local-network`. */
const LOCAL_ENDPOINT = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/|$)/;

/** Local servers mostly take any key or none; the SDK still needs one to send. */
export const NO_KEY = 'no-key';

/** Whether the settings point at a server on this computer. */
export const usesLocalServer = (settings: AssistantSettings): boolean =>
  settings.provider === 'compatible' && LOCAL_ENDPOINT.test(settings.endpoint);

/** The context sizes the settings form offers: a few messages, the default, or more. */
const FEW = 5;
const DEFAULT_CONTEXT = 10;
const MANY = 20;
const CONTEXTS: ReadonlySet<unknown> = new Set([FEW, DEFAULT_CONTEXT, MANY]);

const text = (value: SettingValue | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** Where the model server the assistant found on this computer is kept in its storage (#456). */
export const LOCAL_SERVER_KEY = 'localServer';

/** Whether the user chose a provider in the extension's settings form. */
export const choseProvider = (values: Readonly<Record<string, SettingValue>>): boolean =>
  PROVIDERS.has(values['provider']);

/** The address of the server kept under {@link LOCAL_SERVER_KEY}, if it is one on this computer. */
function foundEndpoint(found: unknown): string | undefined {
  const { endpoint } = Object(found) as { endpoint?: unknown };
  return typeof endpoint === 'string' && LOCAL_ENDPOINT.test(endpoint) ? endpoint : undefined;
}

/** What the assistant keeps besides its settings: the private model picked, and the server found. */
export interface Kept {
  /** The record under `BUILT_IN_KEY` (#457). */
  readonly builtIn?: unknown;
  /** The record under {@link LOCAL_SERVER_KEY} (#456). */
  readonly found?: unknown;
}

/**
 * Who answers, in this order (#456, #457): the provider the user chose in
 * the Extensions window, then the private model the user picked, then the
 * model server the assistant found on this computer, then Claude, which
 * waits for a key. The private model is offered only when no server was
 * found, so the user picks it after any search.
 */
function providerOf(
  values: Readonly<Record<string, SettingValue>>,
  kept: Kept,
): Pick<AssistantSettings, 'provider' | 'endpoint' | 'source'> {
  const endpoint = text(values['endpoint']);
  if (choseProvider(values)) {
    return { provider: values['provider'] as ProviderId, endpoint, source: 'chosen' };
  }
  if (builtInRecord(kept.builtIn) !== undefined) {
    return { provider: 'built-in', endpoint, source: 'picked' };
  }
  const found = foundEndpoint(kept.found);
  return found === undefined
    ? { provider: 'anthropic', endpoint, source: 'default' }
    : { provider: 'compatible', source: 'found', endpoint: found };
}

/**
 * The saved settings, with what the assistant keeps besides them: the
 * private model the user picked and the model server it found on this
 * computer, either of which answers until the user chooses a provider.
 */
export function assistantSettings(
  values: Readonly<Record<string, SettingValue>>,
  kept: Kept = {},
): AssistantSettings {
  return {
    ...providerOf(values, kept),
    builtIn: builtInRecord(kept.builtIn),
    // Picked in the bar, or by Auto, from what the provider lists (#467); never typed in.
    model: '',
    context: CONTEXTS.has(values['context']) ? (values['context'] as number) : DEFAULT_CONTEXT,
    localOnly: values['localOnly'] === true,
  };
}

/** Where each provider's key is kept in the extension's own secrets. */
export const keyName = (provider: ProviderId): string => `apiKey.${provider}`;

const hasKey = (apiKey: string | undefined): boolean => apiKey !== undefined && apiKey !== '';

/** Whether a compatible server's address is one the assistant may use. */
const validEndpoint = (settings: AssistantSettings): boolean =>
  settings.endpoint.startsWith('https://') || usesLocalServer(settings);

/**
 * What the assistant still needs before it can ask anyone, or '' when it
 * has it all. In local-only mode, nothing but a server on this computer
 * will do; such a server needs no key.
 */
export function missingSetup(settings: AssistantSettings, apiKey: string | undefined): string {
  return settings.provider === 'built-in'
    ? missingDownload(settings)
    : missingService(settings, apiKey);
}

/**
 * The private model needs only to be all downloaded: nothing leaves this
 * computer, so local-only mode has nothing to stop.
 */
function missingDownload({ builtIn }: AssistantSettings): string {
  return builtIn?.ready === true ? '' : 'download';
}

/** What a provider over the network, or a server on this computer, still needs. */
function missingService(settings: AssistantSettings, apiKey: string | undefined): string {
  const local = usesLocalServer(settings);
  if (settings.localOnly && !local) {
    return 'local-only';
  }
  if (!local && !hasKey(apiKey)) {
    return 'key';
  }
  return settings.provider === 'compatible' && !validEndpoint(settings) ? 'endpoint' : '';
}

/**
 * Why the assistant cannot ask anyone yet: the setup, or a provider that
 * lists no model, which for the server found on this computer means it
 * does not answer.
 */
export function missingSetting(settings: AssistantSettings, apiKey: string | undefined): string {
  const setup = missingSetup(settings, apiKey);
  if (setup !== '' || settings.model !== '') {
    return setup;
  }
  return settings.source === 'found' ? 'local-server' : 'model';
}

/**
 * Whether to offer finding a model on this computer (#456): only to
 * someone who set nothing up, whom Claude's missing key or local-only mode
 * would otherwise stop.
 */
export function offersSearch(settings: AssistantSettings, apiKey: string | undefined): boolean {
  const missing = missingSetup(settings, apiKey);
  return settings.source === 'default' && (missing === 'key' || missing === 'local-only');
}

/** What runs the private model in this page, for {@link providerFor}. */
export interface BuiltInRunner {
  readonly provider: () => Provider;
}

/** The provider the settings describe, once nothing is missing. */
export function providerFor(
  settings: AssistantSettings,
  apiKey: string | undefined,
  builtIn: BuiltInRunner,
): Provider {
  const { model } = settings;
  const key = apiKey ?? NO_KEY;
  switch (settings.provider) {
    case 'anthropic':
      return anthropicProvider({ apiKey: key, model });
    case 'openai':
      return openAIProvider({ apiKey: key, model });
    case 'built-in':
      return builtIn.provider();
    default:
      return openAIProvider({ model, apiKey: key, baseURL: settings.endpoint });
  }
}
