import type { SettingValue } from '@yapyap/plugin-sdk';
import { anthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic.ts';
import { openAIProvider } from './providers/openai.ts';
import type { Provider } from './providers/provider.ts';

/** Which service the assistant asks, as the settings form names it. */
export type ProviderId = 'anthropic' | 'openai' | 'compatible';

const PROVIDERS: ReadonlySet<unknown> = new Set<ProviderId>(['anthropic', 'openai', 'compatible']);

/** What the user chose in the plugin's settings form. */
export interface AssistantSettings {
  readonly provider: ProviderId;
  readonly model: string;
  /** The compatible server's address; unused for the others. */
  readonly endpoint: string;
}

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
  };
}

/** Where each provider's key is kept in the plugin's own secrets. */
export const keyName = (provider: ProviderId): string => `apiKey.${provider}`;

/** Why the assistant cannot ask anyone yet, or '' when it can. */
export function missingSetting(settings: AssistantSettings, apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey === '') {
    return 'key';
  }
  if (settings.model === '') {
    return 'model';
  }
  return settings.provider === 'compatible' && !settings.endpoint.startsWith('https://')
    ? 'endpoint'
    : '';
}

/** The provider the settings describe, once nothing is missing. */
export function providerFor(settings: AssistantSettings, apiKey: string): Provider {
  const { model } = settings;
  switch (settings.provider) {
    case 'anthropic':
      return anthropicProvider({ apiKey, model });
    case 'openai':
      return openAIProvider({ apiKey, model });
    default:
      return openAIProvider({ apiKey, model, baseURL: settings.endpoint });
  }
}
