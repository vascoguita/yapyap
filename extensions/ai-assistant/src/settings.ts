import type { SettingValue } from '@yapyap/extension-sdk';
import { anthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic.ts';
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

/** The saved settings, with Claude as the default until the user picks another. */
export function assistantSettings(
  values: Readonly<Record<string, SettingValue>>,
): AssistantSettings {
  const provider = PROVIDERS.has(values['provider'])
    ? (values['provider'] as ProviderId)
    : 'anthropic';
  const model = text(values['model']);
  return {
    provider,
    model: model === '' && provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : model,
    endpoint: text(values['endpoint']),
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
 * Why the assistant cannot ask anyone yet, or '' when it can. In local-only
 * mode, nothing but a server on this computer will do; such a server needs
 * no key.
 */
export function missingSetting(settings: AssistantSettings, apiKey: string | undefined): string {
  const local = usesLocalServer(settings);
  if (settings.localOnly && !local) {
    return 'local-only';
  }
  if (!local && !hasKey(apiKey)) {
    return 'key';
  }
  if (settings.model === '') {
    return 'model';
  }
  return settings.provider === 'compatible' && !validEndpoint(settings) ? 'endpoint' : '';
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
