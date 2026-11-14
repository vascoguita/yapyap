import { en } from '../../shared/messages/en.ts';
import type { ProviderId } from './models.ts';
import type { ProviderErrorKind } from './providers/provider.ts';
import type { Setup } from './setup.ts';

/** A status line, and the button to Settings that fixes it, if any. */
export interface Words {
  readonly status: string;
  readonly fix?: { readonly label: string };
}

const { bar, status, problems } = en.assistant;

const TITLES: Readonly<Record<string, string | undefined>> = en.assistant.providerTitles;

/** How a provider is named at the start of a sentence; nothing before one is set up. */
export const providerTitle = (provider: ProviderId | undefined): string =>
  TITLES[String(provider)] ?? '';

/** What the bar says while the assistant cannot answer yet, and how to fix it in one click. */
export function setupWords(setup: Setup): Words {
  switch (setup.missing) {
    case 'key':
      return {
        status: status.key({ provider: providerTitle(setup.provider) }),
        fix: { label: bar.pasteKey },
      };
    case 'model':
      return {
        status:
          setup.provider === 'server'
            ? status.server
            : status.noModel({ provider: providerTitle(setup.provider) }),
        fix: { label: bar.openSettings },
      };
    default:
      // A model server is chosen, but has no address yet.
      return {
        status: setup.provider === 'server' ? status.address : status.setUp,
        fix: { label: bar.setUp },
      };
  }
}

const PROBLEMS: Readonly<Record<ProviderErrorKind, (provider: string) => string>> = {
  auth: (provider) => problems.auth({ provider }),
  'rate-limited': (provider) => problems.rateLimited({ provider }),
  network: (provider) => problems.network({ provider }),
  timeout: (provider) => problems.timeout({ provider }),
  refused: () => problems.refused,
  'bad-request': (provider) => problems.badRequest({ provider }),
  cancelled: () => problems.cancelled,
  failed: () => problems.failed,
};

/** What the bar says when a request failed, with a fix where one click can mend it. */
export function problemWords(kind: ProviderErrorKind, provider: ProviderId | undefined): Words {
  const text = PROBLEMS[kind](providerTitle(provider));
  return kind === 'auth' ? { status: text, fix: { label: bar.pasteKey } } : { status: text };
}
