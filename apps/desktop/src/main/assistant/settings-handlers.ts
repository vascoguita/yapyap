import {
  CHROME_CHANNELS,
  type AssistantView,
  type KeyedProvider,
} from '../../shared/api/chrome-api.ts';
import { argumentsOf, isString, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { SettingsService } from '../settings/service.ts';
import { problemWords, setupWords } from './bar-words.ts';
import { isChatId, type AllowedChats } from './chats.ts';
import type { AssistantCore } from './core.ts';
import { KEYED_PROVIDERS, pastedKey, type AssistantKeys } from './keys.ts';
import type { LocalServer } from './local-servers.ts';
import { keyProblem } from './models.ts';

export interface AssistantSettingsDependencies {
  readonly core: Pick<AssistantCore, 'setup'>;
  readonly keys: AssistantKeys;
  /** Where the model server is, to test its key there and nowhere else. */
  readonly settings: Pick<SettingsService, 'current'>;
  readonly chats: Pick<AllowedChats, 'list' | 'forget' | 'allow'>;
  /** Every account, to name the ones with allowed chats. */
  readonly accounts: () => readonly { readonly id: string; readonly name: string }[];
  /** The account on screen and its open chat's name; null while no chat is open. */
  readonly openChat: () => Promise<{ readonly account: string; readonly name: string } | null>;
  readonly findServers: () => Promise<readonly LocalServer[]>;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  /** Tells the bar the setup changed. */
  readonly changed: () => void;
}

async function chatsOf(deps: AssistantSettingsDependencies): Promise<AssistantView['chats']> {
  const accounts = new Map(deps.accounts().map(({ id, name }) => [id, name]));
  const listed = await deps.chats.list();
  return listed.flatMap(({ account, chats }) => {
    const accountName = accounts.get(account);
    return accountName === undefined || chats.length === 0
      ? []
      : [
          {
            account,
            accountName,
            chats: chats.map(({ id, name }) => ({ id, name: name ?? null })),
          },
        ];
  });
}

async function viewOf(deps: AssistantSettingsDependencies): Promise<AssistantView> {
  const setup = await deps.core.setup();
  const blocked = setup.missing !== '' && setup.missing !== 'off';
  const saved = async (provider: KeyedProvider) => (await deps.keys.get(provider)) !== undefined;
  return {
    inUse: setup.provider ?? null,
    status: blocked ? setupWords(setup).status : '',
    keys: {
      anthropic: await saved('anthropic'),
      openai: await saved('openai'),
      server: await saved('server'),
    },
    models: setup.models,
    auto: setup.auto === undefined ? null : { id: setup.auto.id, label: setup.auto.label },
    chats: await chatsOf(deps),
  };
}

const isProvider = (value: unknown): value is KeyedProvider =>
  (KEYED_PROVIDERS as readonly unknown[]).includes(value);

/** Testing a key: '' when the provider answers, else what failed, in the user's words. */
async function testKey(deps: AssistantSettingsDependencies, provider: KeyedProvider) {
  const key = await deps.keys.get(provider);
  const server = deps.settings.current().assistant.server;
  const problem = key === undefined ? 'auth' : await keyProblem(provider, key, deps.fetch, server);
  return problem === '' ? '' : problemWords(problem, provider).status;
}

/** The keys: what the bar shows changes with them. */
function setupHandlers(deps: AssistantSettingsDependencies): ChromeHandler[] {
  const changing = async <T>(work: () => Promise<T> | T): Promise<T> => {
    const result = await work();
    deps.changed();
    return result;
  };
  return [
    {
      channel: CHROME_CHANNELS.assistantSaveKey,
      accepts: argumentsOf(isProvider, (key) => pastedKey(key) !== undefined),
      handle: (_call, provider, key) =>
        changing(() => deps.keys.save(provider as KeyedProvider, String(pastedKey(key)))),
    },
    {
      channel: CHROME_CHANNELS.assistantForgetKey,
      accepts: argumentsOf(isProvider),
      handle: (_call, provider) => changing(() => deps.keys.forget(provider as KeyedProvider)),
    },
  ];
}

/**
 * Settings › Assistant's operations (ADR 0017). Each checks its payload:
 * a key only as a short pasted text for a known provider, which is never
 * logged or sent back; a chat only by its fingerprint, or as the one open
 * on screen, which the user can see.
 */
export function assistantHandlers(deps: AssistantSettingsDependencies): ChromeHandler[] {
  return [
    { channel: CHROME_CHANNELS.assistantView, accepts: noArguments, handle: () => viewOf(deps) },
    ...setupHandlers(deps),
    {
      channel: CHROME_CHANNELS.assistantTestKey,
      accepts: argumentsOf(isProvider),
      handle: (_call, provider) => testKey(deps, provider as KeyedProvider),
    },
    {
      channel: CHROME_CHANNELS.assistantFindServers,
      accepts: noArguments,
      handle: () => deps.findServers(),
    },
    {
      channel: CHROME_CHANNELS.assistantForgetChat,
      accepts: argumentsOf(isString, isChatId),
      handle: (_call, account, id) => {
        deps.chats.forget(account as string, id as string);
      },
    },
    {
      channel: CHROME_CHANNELS.assistantAllowOpenChat,
      accepts: noArguments,
      handle: async () => {
        const open = await deps.openChat();
        if (open !== null) {
          await deps.chats.allow(open.account, open.name);
        }
        return open !== null;
      },
    },
  ];
}
