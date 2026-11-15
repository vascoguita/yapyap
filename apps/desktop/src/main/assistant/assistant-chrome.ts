import type { ReadChat } from '../../adapter/active-chat.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { SettingsService } from '../settings/service.ts';
import type { AssistantBarView } from './bar-page.ts';
import { createAssistantBar, type AssistantBar, type BarAccounts } from './bar.ts';
import type { AllowedChats } from './chats.ts';
import { assistantCore, type AssistantCore } from './core.ts';
import type { AssistantKeys } from './keys.ts';
import type { LocalServer } from './local-servers.ts';
import { keptModels } from './models.ts';
import { assistantHandlers } from './settings-handlers.ts';

/** The accounts as the assistant reaches them: the one on screen, and its open chat. */
export interface AssistantAccounts {
  readonly entries: readonly {
    readonly id: string;
    readonly name: string;
    readonly active: boolean;
  }[];
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  readonly readDraft: () => Promise<string | null>;
  readonly replaceDraft: (text: string) => Promise<boolean>;
}

/** What the assistant is made of, which `index.ts` puts together from Electron. */
export interface AssistantSources {
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  readonly chats: AllowedChats;
  readonly keys: AssistantKeys;
  readonly findServers: () => Promise<readonly LocalServer[]>;
}

export interface AssistantChromeDependencies {
  readonly sources: AssistantSources;
  readonly settings: SettingsService;
  /** The accounts once they are open. */
  readonly accounts: () => AssistantAccounts | undefined;
  readonly openSettings: () => void;
  readonly warn: (message: string) => void;
}

export interface AssistantChrome {
  readonly handlers: readonly ChromeHandler[];
  /** Gives the assistant its view in the active account's WhatsApp, made from it (ADR 0013). */
  readonly attachBar: (create: (bar: AssistantBar) => AssistantBarView) => void;
  /** Shows the setup anew, as when the account on screen changes. */
  readonly refreshBar: () => void;
}

/** The account on screen, as the bar reaches it; before there are accounts, there is no chat. */
export function barAccounts(current: () => AssistantAccounts | undefined): BarAccounts {
  return {
    active: () => current()?.entries.find((entry) => entry.active)?.id ?? '',
    readActiveChat: (messages) => current()?.readActiveChat(messages) ?? Promise.resolve(null),
    readDraft: () => current()?.readDraft() ?? Promise.resolve(null),
    replaceDraft: (text) => current()?.replaceDraft(text) ?? Promise.resolve(false),
  };
}

/** The account on screen and the name of its open chat, for Settings to allow it; null with none open. */
async function openChatOf(
  accounts: BarAccounts,
): Promise<{ readonly account: string; readonly name: string } | null> {
  const account = accounts.active();
  const chat = account === '' ? null : await accounts.readActiveChat(1);
  return chat === null ? null : { account, name: chat.name };
}

/** Runs `run` after `ms`; returns how to call it off. */
export const later = (ms: number, run: () => void): (() => void) => {
  const timer = setTimeout(run, ms);
  return () => {
    clearTimeout(timer);
  };
};

/** The time now, as the bar tells the model. */
export const clock = (): Date => new Date();

/** Where the bar's view goes once the accounts are open. */
interface ViewSlot {
  current?: AssistantBarView;
}

/** The bar, which shows itself through the view it is given once the accounts are open. */
function barOf(
  deps: AssistantChromeDependencies,
  core: AssistantCore,
  view: ViewSlot,
): AssistantBar {
  return createAssistantBar({
    ...deps.sources,
    core,
    settings: deps.settings,
    accounts: barAccounts(deps.accounts),
    openSettings: deps.openSettings,
    after: later,
    show: (visible) => view.current?.show(visible),
    publish: (state) => view.current?.publish(state),
    now: clock,
  });
}

/** Shows the setup anew in the bar, saying in the log when it cannot. */
function refresher(deps: AssistantChromeDependencies, bar: AssistantBar): () => void {
  return () => {
    bar.refresh().catch(() => {
      deps.warn('The assistant bar could not show the setup.');
    });
  };
}

/**
 * The AI assistant, part of YapYap (ADR 0017): the setup, the bar in
 * WhatsApp's page, and Settings › Assistant's operations. The bar shows
 * the setup anew whenever the settings or the keys change.
 */
export function createAssistantChrome(deps: AssistantChromeDependencies): AssistantChrome {
  const { sources, settings } = deps;
  const core = assistantCore({ ...sources, settings, list: keptModels() });
  const view: ViewSlot = {};
  const bar = barOf(deps, core, view);
  const refresh = refresher(deps, bar);
  settings.onChange(refresh);
  const handlers = assistantHandlers({
    ...sources,
    core,
    settings,
    accounts: () => deps.accounts()?.entries ?? [],
    openChat: () => openChatOf(barAccounts(deps.accounts)),
    changed: refresh,
  });
  return {
    handlers,
    attachBar: (create) => {
      view.current = create(bar);
      refresh();
    },
    refreshBar: refresh,
  };
}
