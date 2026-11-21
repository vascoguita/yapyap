import type { MenuItemConstructorOptions } from 'electron';
import { buildAboutInfo, formatTechnicalDetails, type RuntimeFacts } from '../about/about-info.ts';
import { aboutHandlers } from '../about/about-handlers.ts';
import { currentDiagnostics, diagnostics } from '../crash/diagnostics.ts';
import { recoveryHandlers } from '../recovery/recovery-handlers.ts';
import type { AdapterPage } from '../../adapter/world.ts';
import type { ReadChat } from '../../adapter/active-chat.ts';
import { folderChoiceHandlers } from '../settings/folder-choice.ts';
import { shortcutHandlers } from '../shortcuts/shortcuts-handlers.ts';
import { customCodeHandlers } from '../custom-code/custom-code-handlers.ts';
import type { CustomCodeController } from '../custom-code/custom-code.ts';
import { spellingHandlers, type SpellingSources } from '../spelling/spelling-languages-handlers.ts';
import { DOWNLOADS_PAGE, downloadsHandlers } from '../downloads/downloads-handlers.ts';
import type { DownloadList } from '../downloads/download-list.ts';
import {
  createProxyLoginPrompt,
  PROXY_LOGIN_PAGE,
  type ProxyLoginPrompt,
} from '../network/proxy-login-handlers.ts';
import type { InstallEvidence } from '../updates/update-policy.ts';
import {
  createSourcePicker,
  type DesktopSource,
  type SourceKind,
  type SourcePicker,
} from '../capture/picker.ts';
import { changeZoom } from '../appearance/zoom.ts';
import { buildMenuTemplate, type MenuActions } from '../app/menu.ts';
import { pause } from '../support/pause.ts';
import { accountsHandlers, type AccountManager } from '../accounts/accounts-handlers.ts';
import { problemReportHandlers } from '../crash/problem-report-handlers.ts';
import {
  attachSidebar,
  sidebarHandlers,
  type SidebarPort,
  type SidebarSlot,
  type SidebarSource,
} from '../accounts/sidebar-handlers.ts';
import {
  createRecovery,
  type Overlay,
  type RecoverableContents,
  type Recovery,
} from '../recovery/controller.ts';
import { guardCrashes, type CrashableContents } from '../recovery/crash-guard.ts';
import { monitorPage, type MonitoredContents } from '../recovery/monitor.ts';
import { isAccountColor } from '../accounts/accounts.ts';
import {
  createAssistantChrome,
  type AssistantChrome,
  type AssistantSources,
} from '../assistant/assistant-chrome.ts';
import { agentServer, type AgentSources } from '../agents/server.ts';
import { agentsHandlers } from '../agents/settings-handlers.ts';
import type { AgentAccounts, AgentPage } from '../agents/tool-steps.ts';
import { setDoNotDisturb } from '../notifications/quiet.ts';
import { settingsHandlers, type SettingEffect } from '../settings/handlers.ts';
import type { SettingsService } from '../settings/service.ts';
import type { Settings } from '../settings/schema.ts';
import { settingsTransferHandlers, type SettingsFiles } from '../settings/transfer-handlers.ts';
import type { ViewRegistry } from '../security/views.ts';
import type { RendererOptions } from '../window/web-preferences.ts';
import type { WindowOptions } from '../window/windows.ts';
import { CHROME_SCHEME, createChromeHandler } from './assets.ts';
import { registerChromeHandlers, type ChromeHandler, type IpcMainPort } from '../ipc/chrome.ts';
import {
  chromeWindowOpener,
  openPromptWindow,
  type ChromePage,
  type ChromeWindowDependencies,
  type ChromeWindowPort,
} from './window-opener.ts';
import { en } from '../../shared/messages/en.ts';
import { WINDOW_SIZES } from './window-sizes.ts';

/** In memory only: app chrome never shares storage with WhatsApp or keeps any. */
export const CHROME_PARTITION = 'yapyap-chrome';

const ABOUT_PAGE: ChromePage = {
  path: 'about.html',
  window: {
    title: en.windows.about,
    width: WINDOW_SIZES.dialogWidth,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

const PICKER_PAGE: ChromePage = {
  path: 'picker.html',
  window: {
    title: en.windows.picker,
    ...WINDOW_SIZES.large,
    minimizable: false,
    modal: true,
  },
};

const ACCOUNTS_PAGE: ChromePage = {
  path: 'accounts.html',
  window: {
    title: en.windows.accounts,
    ...WINDOW_SIZES.large,
    minimizable: false,
    maximizable: false,
  },
};

const WELCOME_PAGE: ChromePage = {
  path: 'welcome.html',
  window: {
    title: en.windows.welcome,
    ...WINDOW_SIZES.medium,
    minimizable: false,
    maximizable: false,
  },
};

const REPORT_PAGE: ChromePage = {
  path: 'report.html',
  window: {
    title: en.windows.report,
    ...WINDOW_SIZES.medium,
    minimizable: false,
  },
};

const SETTINGS_PAGE: ChromePage = {
  path: 'settings.html',
  window: {
    title: en.windows.settings,
    ...WINDOW_SIZES.large,
  },
};

interface PrivilegedScheme {
  readonly scheme: string;
  readonly privileges: {
    readonly standard: boolean;
    readonly secure: boolean;
  };
}

export interface ChromeFeatureDependencies {
  readonly registerSchemesAsPrivileged: (schemes: readonly PrivilegedScheme[]) => void;
  readonly chromeProtocol: () => {
    handle(scheme: string, handler: (request: { readonly url: string }) => Promise<Response>): void;
  };
  readonly ipc: IpcMainPort;
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => ChromeWindowPort;
  readonly setMenu: (template: MenuItemConstructorOptions[]) => void;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  /** Records a performance trace, if the user agrees, and saves it (#113). */
  readonly recordTrace: () => void;
  /** Opens a web page in the user's browser, such as GitHub's bug form. */
  readonly openExternal: (url: string) => Promise<unknown>;
  /** A system notification, for things the user should know but need not act on. */
  readonly notify: (message: string) => void;
  /** `app.getGPUFeatureStatus()`, summarized for diagnostics. */
  readonly gpuStatus: () => Readonly<Record<string, string>>;
  /** What YapYap observes about how it was installed, for the update policy. */
  readonly installEvidence: () => InstallEvidence;
  /** The recent, already redacted log lines. */
  readonly recentLog: () => readonly string[];
  /** Everything but the graphics mode, which is only settled at startup. */
  readonly facts: () => Omit<RuntimeFacts, 'graphics'>;
  readonly platform: string;
  readonly rendererRoot: string;
  readonly preloadPath: string;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly settings: SettingsService;
  /** Carries changes of these fields out in the system before saving them. */
  readonly settingEffects: Readonly<Record<string, SettingEffect>>;
  /** Settings this build ignores, so the settings window leaves them out. */
  readonly hiddenSettings: readonly string[];
  readonly settingsFiles: SettingsFiles;
  /** The system's folder dialog over the given window; undefined when cancelled. */
  readonly chooseFolder: (owner: object) => Promise<string | undefined>;
  /** `globalShortcut.isRegistered`: whether the system granted YapYap these keys. */
  readonly isGlobalShortcutRegistered: (accelerator: string) => boolean;
  readonly spelling: SpellingSources;
  /** The user's own CSS and JavaScript (#72). */
  readonly customCode: CustomCodeController;
  /** This session's downloads, for the Downloads window. */
  readonly downloads: DownloadList;
  /** Quits and starts YapYap again, to apply settings that need a restart. */
  readonly restart: () => void;
  /** Asks before logging the account out; true when the user agrees. */
  readonly confirmLogOut: () => Promise<boolean>;
  /** Asks before removing the account named `name`; true when the user agrees. */
  readonly confirmRemoveAccount: (name: string) => Promise<boolean>;
  /** The AI assistant, part of YapYap (ADR 0017). */
  readonly assistant: AssistantSources;
  /** The MCP server for AI agents (ADR 0019). */
  readonly agents: AgentSources;
  readonly captureSources: (kind: SourceKind) => Promise<readonly DesktopSource[]>;
  /** The window showing `contents`, so the picker can sit on top of it. */
  readonly windowOf: (contents: object) => WindowOptions['parent'] | null;
}

export type WhatsAppContents = MonitoredContents & RecoverableContents & CrashableContents;

export interface ChromeRuntime {
  /** Watches a WhatsApp view and shows the recovery screen over it when it fails. */
  readonly attachRecovery: (
    contents: WhatsAppContents,
    origin: string,
    createOverlay: (renderer: RendererOptions) => Overlay,
  ) => Pick<Recovery, 'reconnect'>;
  /** YapYap's screen-sharing picker, for platforms without a system one. */
  readonly pickCaptureSource: SourcePicker['pick'];
  /** The About window's technical details, for crash reports. */
  readonly technicalDetails: () => string;
  /** Lists the accounts in the Account menu, whose actions apply to the active one. */
  readonly setAccountMenu: (menu: AccountMenu) => void;
  readonly openSettings: () => void;
  /** Settings at its Assistant page, for the assistant's own buttons. */
  readonly openAssistantSettings: () => void;
  /** The first launch's welcome (#84). */
  readonly openWelcome: () => void;
  /** Settings at its Spelling page, for the message box's right-click menu. */
  readonly openSpellingSettings: () => void;
  /** Asks the user to sign in to a proxy, one proxy at a time (#76). */
  readonly askProxyLogin: ProxyLoginPrompt['ask'];
  /** Docks the account sidebar; returns how to show it the accounts. */
  readonly attachSidebar: (
    create: (renderer: RendererOptions) => SidebarPort,
  ) => (source: SidebarSource) => void;
  /** Gives the assistant its view in the active account's WhatsApp (ADR 0013). */
  readonly attachAssistantBar: AssistantChrome['attachBar'];
}

/** The accounts as the menu and the Accounts window need them. */
export interface AccountMenu extends AccountManager {
  /** The active account's WhatsApp, which Clear Cache and Reset Session act on. */
  readonly activeContents: () => object;
  /** Puts the assistant's draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
  /** The active account's open chat, with its last `messages` messages; null when none is open. */
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  /** Replaces the active account's draft; false when no chat is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** The active account's draft; null when no chat is open. */
  readonly readDraft: () => Promise<string | null>;
  /** An account's WhatsApp as AI agents reach it (ADR 0019); undefined while it is off. */
  readonly agentPage: (id: string) => AgentPage | undefined;
  readonly switchTo: (id: string) => void;
  readonly privacyScreen: boolean;
  readonly togglePrivacyScreen: () => void;
}

/** Until the accounts are open, their menu items do nothing. */
const ignore = (): void => undefined;

/** The accounts once they are open; replaced whenever they change. */
interface AccountsSlot {
  current?: AccountMenu;
}

export interface ChromeFeature {
  /** Must run before the app is ready, when custom schemes can still be registered. */
  readonly beforeReady: () => void;
  /** `graphics` describes the rendering mode startup settled on, for diagnostics. */
  readonly afterReady: (
    views: ViewRegistry,
    warn: (message: string) => void,
    graphics: string,
  ) => ChromeRuntime;
}

/** The dependencies, with the facts completed by the graphics mode startup settled on. */
type ChromeDependencies = Omit<ChromeFeatureDependencies, 'facts'> & {
  readonly facts: () => RuntimeFacts;
};

function recoveryAttacher(
  deps: ChromeDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  recoveries: Map<object, Recovery>,
  pages: AdapterPage[],
): ChromeRuntime['attachRecovery'] {
  const technicalDetails = () => diagnostics(deps);
  return (contents, origin, createOverlay) => {
    pages.push(contents);
    const recovery = createRecovery({
      contents,
      origin,
      views,
      technicalDetails,
      warn,
      createOverlay: () => createOverlay(renderer),
      writeClipboard: deps.writeClipboard,
    });
    recoveries.set(contents, recovery);
    monitorPage(contents, { onFailure: recovery.show, schedule: setTimeout, warn });
    guardCrashes(contents, {
      now: Date.now,
      schedule: setTimeout,
      notify: deps.notify,
      showFailure: recovery.show,
      warn,
    });
    return recovery;
  };
}

function sourcePicker(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
): SourcePicker {
  return createSourcePicker({
    getSources: deps.captureSources,
    offerAudio: deps.platform === 'win32',
    wait: pause,
    openPicker: (owner) => {
      const parent = deps.windowOf(owner);
      return openPromptWindow(windows, PICKER_PAGE, parent == null ? {} : { parent });
    },
  });
}

/** Acts on the account on screen. */
function accountActions(
  deps: ChromeFeatureDependencies,
  recoveries: ReadonlyMap<object, Recovery>,
  menu: AccountMenu | undefined,
  warn: (message: string) => void,
): Pick<MenuActions, 'reload' | 'clearCache' | 'logOut' | 'removeAccount'> {
  const failed = (): void => {
    warn('Could not finish an account maintenance action.');
  };
  const active = (): Recovery | undefined =>
    menu === undefined ? undefined : recoveries.get(menu.activeContents());
  return {
    reload: () => {
      active()?.retry().catch(failed);
    },
    clearCache: () => {
      active()?.clearCacheAndRetry().catch(failed);
    },
    logOut: () => {
      deps
        .confirmLogOut()
        .then((confirmed) => (confirmed ? active()?.logOut() : undefined))
        .catch(failed);
    },
    removeAccount: () => {
      const entry = menu?.entries.find((candidate) => candidate.active);
      if (menu === undefined || entry === undefined) {
        return;
      }
      deps
        .confirmRemoveAccount(entry.name)
        .then((confirmed) => (confirmed ? menu.remove(entry.id) : false))
        .catch(failed);
    },
  };
}

/** Do not disturb, kept in the settings, and muting the account on screen. */
function quietActions(
  settings: SettingsService,
  menu: AccountMenu | undefined,
): Pick<MenuActions, 'doNotDisturb' | 'setDoNotDisturb' | 'setMuted'> {
  return {
    doNotDisturb: settings.current().general.doNotDisturb,
    setDoNotDisturb: (on) => {
      setDoNotDisturb(settings, on);
    },
    setMuted: (muted) => {
      const entry = menu?.entries.find((candidate) => candidate.active);
      if (menu !== undefined && entry !== undefined && isAccountColor(entry.color)) {
        const { name, color, enabled, proxy } = entry;
        menu.update(entry.id, { name, color, enabled, muted, proxy });
      }
    },
  };
}

function chromeWindows(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
): ChromeWindowDependencies {
  return { createWindow: (options) => deps.createWindow(options, renderer), views, warn };
}

/**
 * Opens a window at its page's start. Menus call their items' handlers with
 * the item, which must never reach the opener as a place in the page.
 */
function plainOpener(windows: ChromeWindowDependencies, page: ChromePage): () => void {
  const open = chromeWindowOpener(windows, page);
  return () => {
    open();
  };
}

/** YapYap's own windows, one each: opening one again focuses it. */
type ChromeOpeners = Pick<
  MenuActions,
  'openAccounts' | 'openAbout' | 'openSettings' | 'openShortcuts' | 'openDownloads' | 'openReport'
>;

function chromeOpeners(
  windows: ChromeWindowDependencies,
  standby: Pick<ChromeOpeners, 'openSettings' | 'openShortcuts'>,
): ChromeOpeners {
  const opener = (page: ChromePage): (() => void) => plainOpener(windows, page);
  return {
    openSettings: standby.openSettings,
    openAccounts: opener(ACCOUNTS_PAGE),
    openAbout: opener(ABOUT_PAGE),
    openShortcuts: standby.openShortcuts,
    openDownloads: opener(DOWNLOADS_PAGE),
    openReport: opener(REPORT_PAGE),
  };
}

/** The accounts and the privacy screen, which do nothing until the accounts are open. */
function menuAccounts(
  menu: AccountMenu | undefined,
): Pick<
  MenuActions,
  'accounts' | 'switchAccount' | 'addAccount' | 'privacyScreen' | 'togglePrivacyScreen'
> {
  if (menu === undefined) {
    return {
      accounts: [],
      switchAccount: ignore,
      addAccount: ignore,
      privacyScreen: false,
      togglePrivacyScreen: ignore,
    };
  }
  return {
    accounts: menu.entries,
    switchAccount: menu.switchTo,
    addAccount: menu.add,
    privacyScreen: menu.privacyScreen,
    togglePrivacyScreen: menu.togglePrivacyScreen,
  };
}

type MenuAssistant = Pick<AssistantChrome, 'refreshBar'>;

/** The menu's actions for the accounts as they are. */
function menuActionsOf(
  deps: ChromeDependencies,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages'>,
  openers: ChromeOpeners,
  warn: (message: string) => void,
): (menu: AccountMenu | undefined) => MenuActions {
  return (menu) => ({
    ...menuAccounts(menu),
    ...openers,
    ...accountActions(deps, slots.recoveries, menu, warn),
    ...quietActions(deps.settings, menu),
    zoom: (step) => {
      changeZoom(deps.settings, step);
    },
  });
}

/** Calls `rebuild` when the user changes an in-app shortcut, whose keys the menu shows. */
function onShortcutChange(settings: SettingsService, rebuild: () => void): void {
  const keysOf = ({ shortcuts }: Settings): string => JSON.stringify(shortcuts.custom);
  let keys = keysOf(settings.current());
  settings.onChange((current) => {
    const changed = keysOf(current);
    if (changed !== keys) {
      keys = changed;
      rebuild();
    }
  });
}

/**
 * Sets the application menu now, without accounts, and again whenever the
 * accounts or a shortcut change; returns how to give it the accounts.
 */
function accountMenuSetter(
  deps: ChromeDependencies,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages' | 'accounts'>,
  openers: ChromeOpeners,
  assistant: MenuAssistant,
  warn: (message: string) => void,
): (menu: AccountMenu) => void {
  const actions = menuActionsOf(deps, slots, openers, warn);
  const set = (menu: AccountMenu | undefined): void => {
    deps.setMenu(
      buildMenuTemplate(deps.platform, actions(menu), deps.settings.current().shortcuts.custom),
    );
  };
  const rebuild = (): void => {
    set(slots.accounts.current);
  };
  set(undefined);
  onShortcutChange(deps.settings, rebuild);
  return (menu) => {
    slots.accounts.current = menu;
    set(menu);
    // Each account has its own allowed chats and its own open chat.
    assistant.refreshBar();
  };
}

/** YapYap's own pages, served from the chrome scheme. */
function serveChromePages(deps: ChromeFeatureDependencies): void {
  const handler = createChromeHandler(deps.rendererRoot, deps.readFile);
  deps.chromeProtocol().handle(CHROME_SCHEME, handler);
}

function allHandlers(
  deps: ChromeDependencies,
  { recoveries, pages, picker, accounts, sidebar }: ChromeSlots,
): ChromeHandler[] {
  return [
    ...aboutHandlers(deps),
    ...recoveryHandlers(recoveries),
    ...problemReportHandlers({
      diagnostics: () => currentDiagnostics(deps, pages),
      writeClipboard: deps.writeClipboard,
      openExternal: deps.openExternal,
      recordTrace: deps.recordTrace,
    }),
    ...settingsHandlers(
      deps.settings,
      deps.restart,
      deps.platform,
      deps.settingEffects,
      deps.hiddenSettings,
    ),
    ...settingsTransferHandlers(deps.settings, deps.settingsFiles),
    ...folderChoiceHandlers(deps.settings, deps.chooseFolder),
    ...spellingHandlers(deps.settings, deps.spelling),
    ...downloadsHandlers(deps.downloads),
    ...accountsHandlers(() => accounts.current, deps.confirmRemoveAccount),
    ...customCodeHandlers(deps.customCode, () => accounts.current?.entries ?? []),
    ...sidebarHandlers(sidebar, deps.settings),
    ...picker.handlers,
  ];
}

/** What YapYap's pages share with the main process: the pages it watches and what they act on. */
interface ChromeSlots {
  readonly recoveries: Map<object, Recovery>;
  readonly pages: AdapterPage[];
  readonly picker: SourcePicker;
  readonly accounts: AccountsSlot;
  readonly sidebar: SidebarSlot;
}

function chromeSlots(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
): ChromeSlots {
  return {
    recoveries: new Map(),
    pages: [],
    picker: sourcePicker(deps, windows),
    accounts: {},
    sidebar: {},
  };
}

/** The AI assistant (ADR 0017). */
function assistantOf(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
  accounts: AccountsSlot,
  openSettings: () => void,
): AssistantChrome {
  return createAssistantChrome({
    openSettings,
    sources: deps.assistant,
    settings: deps.settings,
    accounts: () => accounts.current,
    warn: windows.warn,
  });
}

/** The accounts as AI agents reach them, once they are open. */
function agentAccounts(accounts: AccountsSlot): AgentAccounts | undefined {
  const menu = accounts.current;
  return (
    menu && {
      list: () => menu.entries.map(({ id, name }) => ({ id, name })),
      page: menu.agentPage,
    }
  );
}

/** The MCP server for AI agents and Settings › Agents' operations (ADR 0019). */
function agentsOf(
  deps: ChromeFeatureDependencies,
  accounts: AccountsSlot,
  warn: (message: string) => void,
): ChromeHandler[] {
  const { agents } = deps;
  const reach = (): AgentAccounts | undefined => agentAccounts(accounts);
  const server = agentServer({
    ...agents,
    settings: deps.settings,
    accounts: reach,
    notify: deps.notify,
    warn,
  });
  return agentsHandlers({
    server,
    tokens: agents.tokens,
    accounts: reach,
    writeClipboard: deps.writeClipboard,
  });
}

/** Windows that ask or stand by: the assistant's, Settings and proxy sign-in. */
function standbyWindows(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies,
  accounts: AccountsSlot,
): {
  assistant: AssistantChrome;
  /** One Settings window, which the menu and the assistant's bar both open. */
  openSettings: () => void;
  /** The same window, at its Assistant page. */
  openAssistantSettings: () => void;
  /** The same window, at its Keyboard shortcuts page, which Help opens. */
  openShortcuts: () => void;
  /** The same window, at its Spelling page, which the right-click menu opens. */
  openSpellingSettings: () => void;
  proxyLogin: ProxyLoginPrompt;
} {
  const settingsOpener = chromeWindowOpener(windows, SETTINGS_PAGE);
  const openAssistantSettings = (): void => {
    settingsOpener('assistant');
  };
  return {
    openSettings: () => {
      settingsOpener();
    },
    openAssistantSettings,
    openShortcuts: () => {
      settingsOpener('shortcuts');
    },
    openSpellingSettings: () => {
      settingsOpener('spelling');
    },
    assistant: assistantOf(deps, windows, accounts, openAssistantSettings),
    proxyLogin: createProxyLoginPrompt(() => openPromptWindow(windows, PROXY_LOGIN_PAGE)),
  };
}

/** The operations of the windows that wait in the background until needed. */
function standbyHandlers(
  standby: ReturnType<typeof standbyWindows>,
  deps: ChromeFeatureDependencies,
): ChromeHandler[] {
  return [
    ...shortcutHandlers(deps.settings, deps.platform, deps.isGlobalShortcutRegistered),
    ...standby.assistant.handlers,
    ...standby.proxyLogin.handlers,
  ];
}

/** Sets up YapYap's own pages, their operations and the menu once the app is ready. */
function startChrome(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  graphics: string,
): ChromeRuntime {
  const withGraphics = { ...deps, facts: () => ({ ...deps.facts(), graphics }) };
  const windows = chromeWindows(deps, renderer, views, warn);
  const slots = chromeSlots(deps, windows);
  const { recoveries, pages, picker, sidebar } = slots;
  const standby = standbyWindows(deps, windows, slots.accounts);
  const handlers = [
    ...allHandlers(withGraphics, slots),
    ...standbyHandlers(standby, deps),
    ...agentsOf(deps, slots.accounts, warn),
  ];
  registerChromeHandlers(deps.ipc, views, handlers, warn);
  const openers = chromeOpeners(windows, standby);
  return {
    attachRecovery: recoveryAttacher(withGraphics, renderer, views, warn, recoveries, pages),
    pickCaptureSource: picker.pick,
    technicalDetails: () => formatTechnicalDetails(buildAboutInfo(withGraphics.facts())),
    setAccountMenu: accountMenuSetter(withGraphics, slots, openers, standby.assistant, warn),
    openSettings: openers.openSettings,
    openAssistantSettings: standby.openAssistantSettings,
    openWelcome: plainOpener(windows, WELCOME_PAGE),
    openSpellingSettings: standby.openSpellingSettings,
    askProxyLogin: standby.proxyLogin.ask,
    attachSidebar: (create) => attachSidebar(create(renderer), views, sidebar, warn),
    attachAssistantBar: standby.assistant.attachBar,
  };
}

export function createChromeFeature(deps: ChromeFeatureDependencies): ChromeFeature {
  const renderer = { preload: deps.preloadPath, partition: CHROME_PARTITION };
  return {
    beforeReady: () => {
      deps.registerSchemesAsPrivileged([
        { scheme: CHROME_SCHEME, privileges: { standard: true, secure: true } },
      ]);
    },
    afterReady: (views, warn, graphics) => {
      serveChromePages(deps);
      return startChrome(deps, renderer, views, warn, graphics);
    },
  };
}
