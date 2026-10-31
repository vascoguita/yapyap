import type { SettingValue } from '@yapyap/extension-sdk';
import { anthropicProvider } from './providers/anthropic.ts';
import { openAIProvider } from './providers/openai.ts';
import type { Provider } from './providers/provider.ts';

/** Which service the assistant asks, as the settings form names it. */
export type ProviderId = 'anthropic' | 'openai' | 'compatible';

const PROVIDERS: ReadonlySet<unknown> = new Set<ProviderId>(['anthropic', 'openai', 'compatible']);

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
   * the model server found on this computer (#456), or the default.
   */
  readonly source: 'chosen' | 'found' | 'default';
}

/** A server on this computer, which the extension reaches with `local-network`. */
const LOCAL_ENDPOINT = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/|$)/;

/** Local servers mostly take any key or none; the SDK still needs one to send. */
const NO_KEY = 'no-key';

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

/**
 * Who answers, in this order (#456): the provider the user chose in the
 * Extensions window, then the model server the assistant found on this
 * computer, then Claude, which waits for a key.
 */
function providerOf(
  values: Readonly<Record<string, SettingValue>>,
  found: unknown,
): Pick<AssistantSettings, 'provider' | 'endpoint' | 'source'> {
  if (choseProvider(values)) {
    const provider = values['provider'] as ProviderId;
    return { provider, endpoint: text(values['endpoint']), source: 'chosen' };
  }
  const endpoint = foundEndpoint(found);
  return endpoint === undefined
    ? { provider: 'anthropic', endpoint: text(values['endpoint']), source: 'default' }
    : { provider: 'compatible', endpoint, source: 'found' };
}

/**
 * The saved settings, with `found`, the model server the assistant found
 * on this computer, if any, as the provider until the user picks one.
 */
export function assistantSettings(
  values: Readonly<Record<string, SettingValue>>,
  found?: unknown,
): AssistantSettings {
  return {
    ...providerOf(values, found),
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

/** The provider the settings describe, once nothing is missing. */
export function providerFor(settings: AssistantSettings, apiKey: string | undefined): Provider {
  const { model } = settings;
  const key = apiKey ?? NO_KEY;
  switch (settings.provider) {
    case 'anthropic':
      return anthropicProvider({ apiKey: key, model });
    case 'openai':
      return openAIProvider({ apiKey: key, model });
    default:
      return openAIProvider({ model, apiKey: key, baseURL: settings.endpoint });
  }
}
