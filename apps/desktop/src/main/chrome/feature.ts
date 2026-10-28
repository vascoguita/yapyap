import type { MenuItemConstructorOptions } from 'electron';
import { describePageState } from '../../adapter/page-state.ts';
import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import {
  buildAboutInfo,
  formatDiagnostics,
  formatTechnicalDetails,
  summarizeGpu,
  type RuntimeFacts,
} from '../about/about-info.ts';
import { readPageState, type ProbedContents } from '../about/page-state.ts';
import { newChatHandlers, type ChatTarget } from './new-chat.ts';
import { folderChoiceHandlers } from '../settings/folder-choice.ts';
import { shortcutHandlers } from './shortcut-settings.ts';
import { customCodeHandlers } from './custom-code-window.ts';
import type { CustomCodeController } from '../custom-code/custom-code.ts';
import {
  createQuickPanel,
  QUICK_PANEL_PAGE,
  type PanelOwner,
  type PanelPlace,
  type PanelWindow,
  type QuickPanel,
} from './quick-panel.ts';
import { spellingHandlers, type SpellingSources } from './spelling-languages.ts';
import { DOWNLOADS_PAGE, downloadsHandlers } from './downloads-window.ts';
import type { DownloadList } from '../downloads/download-list.ts';
import {
  createProxyLoginPrompt,
  PROXY_LOGIN_PAGE,
  type ProxyLoginPrompt,
} from './proxy-login-window.ts';
import {
  decideUpdatePolicy,
  describeUpdatePolicy,
  type InstallEvidence,
} from '../updates/update-policy.ts';
import {
  createSourcePicker,
  type DesktopSource,
  type SourceKind,
  type SourcePicker,
} from '../capture/picker.ts';
import { changeZoom } from '../appearance/zoom.ts';
import { buildMenuTemplate, type MenuActions } from '../menu.ts';
import { accountsHandlers, type AccountManager } from './accounts.ts';
import { problemReportHandlers } from './problem-report.ts';
import {
  createExtensionChrome,
  type ExtensionAccounts,
  type ExtensionChrome,
  type ExtensionChromeDependencies,
} from '../extensions/extension-chrome.ts';
import {
  attachSidebar,
  sidebarHandlers,
  type SidebarPort,
  type SidebarSlot,
  type SidebarSource,
} from './sidebar.ts';
import {
  createRecovery,
  type Overlay,
  type RecoverableContents,
  type Recovery,
} from '../recovery/controller.ts';
import { guardCrashes, type CrashableContents } from '../recovery/crash-guard.ts';
import { monitorPage, type MonitoredContents } from '../recovery/monitor.ts';
import { isAccountColor } from '../accounts/accounts.ts';
import { EXTENSION_SCHEME } from '../extensions/extension-files.ts';
import { setDoNotDisturb } from '../notifications/quiet.ts';
import { settingsHandlers, type SettingEffect } from '../settings/handlers.ts';
import type { SettingsService } from '../settings/service.ts';
import { settingsTransferHandlers, type SettingsFiles } from '../settings/transfer-handlers.ts';
import type { ViewRegistry } from '../views.ts';
import type { RendererOptions } from '../web-preferences.ts';
import type { WindowOptions } from '../windows.ts';
import { CHROME_SCHEME, createChromeHandler } from './assets.ts';
import {
  noArguments,
  registerChromeHandlers,
  type ChromeCall,
  type ChromeHandler,
  type IpcMainPort,
} from './ipc.ts';
import {
  createChromeWindowOpener,
  openChromeWindow,
  openPromptWindow,
  type ChromePage,
  type ChromeWindowDependencies,
} from './window-opener.ts';
import { en } from '../../shared/messages/en.ts';
import { attachAssistantBar, type AssistantBarPort } from '../assistant/bar-chrome.ts';
import { PRODUCT_NAME } from '../identity.ts';

/** In memory only: app chrome never shares storage with WhatsApp or keeps any. */
export const CHROME_PARTITION = 'yapyap-chrome';

const ABOUT_PAGE: ChromePage = {
  path: 'about.html',
  window: {
    title: en.windows.about({ product: PRODUCT_NAME }),
    width: 480,
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
    width: 760,
    height: 580,
    minWidth: 480,
    minHeight: 400,
    minimizable: false,
    modal: true,
  },
};

const NEW_CHAT_PAGE: ChromePage = {
  path: 'new-chat.html',
  window: {
    title: en.windows.newChat,
    width: 440,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

const SHORTCUTS_PAGE: ChromePage = {
  path: 'shortcuts.html',
  window: {
    title: en.windows.shortcuts,
    width: 520,
    height: 640,
    minWidth: 400,
    minHeight: 360,
    minimizable: false,
  },
};

const CUSTOM_CODE_PAGE: ChromePage = {
  path: 'custom-code.html',
  window: {
    title: en.windows.customCode,
    width: 640,
    height: 720,
    minWidth: 480,
    minHeight: 480,
    minimizable: false,
  },
};

const SPELLING_LANGUAGES_PAGE: ChromePage = {
  path: 'spelling-languages.html',
  window: {
    title: en.windows.spellingLanguages,
    width: 460,
    height: 560,
    minWidth: 360,
    minHeight: 360,
    minimizable: false,
    maximizable: false,
  },
};

const ACCOUNTS_PAGE: ChromePage = {
  path: 'accounts.html',
  window: {
    title: en.windows.accounts,
    width: 560,
    height: 520,
    minWidth: 440,
    minHeight: 360,
    minimizable: false,
    maximizable: false,
  },
};

const WELCOME_PAGE: ChromePage = {
  path: 'welcome.html',
  window: {
    title: en.windows.welcome,
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 420,
    minimizable: false,
    maximizable: false,
  },
};

const REPORT_PAGE: ChromePage = {
  path: 'report.html',
  window: {
    title: en.windows.report,
    width: 600,
    height: 640,
    minWidth: 440,
    minHeight: 420,
    minimizable: false,
  },
};

const SETTINGS_PAGE: ChromePage = {
  path: 'settings.html',
  window: {
    title: en.windows.settings({ product: PRODUCT_NAME }),
    width: 640,
    height: 680,
    minWidth: 420,
    minHeight: 360,
  },
};

interface PrivilegedScheme {
  readonly scheme: string;
  readonly privileges: { readonly standard: boolean; readonly secure: boolean };
}

export interface ChromeFeatureDependencies {
  readonly registerSchemesAsPrivileged: (schemes: readonly PrivilegedScheme[]) => void;
  readonly chromeProtocol: () => {
    handle(scheme: string, handler: (request: { readonly url: string }) => Promise<Response>): void;
  };
  readonly ipc: IpcMainPort;
  readonly createWindow: (options: WindowOptions, renderer: RendererOptions) => PanelWindow;
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
  readonly confirmReset: () => Promise<boolean>;
  /** Asks before removing the account named `name`; true when the user agrees. */
  readonly confirmRemoveAccount: (name: string) => Promise<boolean>;
  readonly extensions: ExtensionChromeDependencies;
  readonly captureSources: (kind: SourceKind) => Promise<readonly DesktopSource[]>;
  /** The window showing `contents`, so the picker can sit on top of it. */
  readonly windowOf: (contents: object) => WindowOptions['parent'] | null;
  /** The screens' work areas, the main screen's first. */
  readonly screens: () => readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  /** Where the user last left the quick-access panel. */
  readonly quickPanelPlace: PanelPlace;
}

export type WhatsAppContents = MonitoredContents & RecoverableContents & CrashableContents;

interface ChromeRuntime {
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
  /** Where the New Chat window opens chats: WhatsApp's window, once it exists. */
  readonly openChatsWith: (open: (phone: string) => void) => void;
  /** Lists the accounts in the Account menu, whose actions apply to the active one. */
  readonly setAccountMenu: (menu: AccountMenu) => void;
  readonly openSettings: () => void;
  /** The first launch's welcome (#84). */
  readonly openWelcome: () => void;
  readonly openSpellingLanguages: () => void;
  /** Asks the user to sign in to a proxy, one proxy at a time (#76). */
  readonly askProxyLogin: ProxyLoginPrompt['ask'];
  /** Shows the quick-access panel as the settings ask, beside `owner`; returns how to show it the accounts. */
  readonly attachQuickPanel: (owner: PanelOwner) => (source: SidebarSource) => void;
  /** The running extensions' right-click items, and how to run one (#98). */
  readonly extensionActions: ExtensionChrome['actions'];
  readonly runExtensionCommand: ExtensionChrome['runCommand'];
  /** Installs the extension an **Install in YapYap** link names (#389). */
  readonly installExtensionFromLink: ExtensionChrome['installFromLink'];
  /** Docks the account sidebar; returns how to show it the accounts. */
  readonly attachSidebar: (
    create: (renderer: RendererOptions) => SidebarPort,
  ) => (source: SidebarSource) => void;
  /** Gives the assistant bar its view beneath the accounts (ADR 0013). */
  readonly attachAssistantBar: (create: (renderer: RendererOptions) => AssistantBarPort) => void;
}

/** The accounts as the menu and the Accounts window need them. */
export interface AccountMenu extends AccountManager {
  /** The active account's WhatsApp, which Clear Cache and Reset Session act on. */
  readonly activeContents: () => object;
  /** Puts an extension's draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
  /** The active account's open chat, for an extension that may read it (#100). */
  readonly readActiveChat: ExtensionAccounts['readActiveChat'];
  /** The active account's draft, for an extension that may rewrite it (#105). */
  readonly replaceDraft: ExtensionAccounts['replaceDraft'];
  readonly readDraft: ExtensionAccounts['readDraft'];
  /** Presses Enter in the active account's message box, for the assistant bar's Send (ADR 0013). */
  readonly pressEnter: () => Promise<boolean>;
  readonly switchTo: (id: string) => void;
  readonly add: () => void;
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
  /**
   * `graphics` describes the rendering mode startup settled on, for
   * diagnostics; `wayland` says whether Chromium runs natively on Wayland.
   */
  readonly afterReady: (
    views: ViewRegistry,
    warn: (message: string) => void,
    graphics: string,
    wayland: boolean,
  ) => ChromeRuntime;
}

type FactsSource = Pick<ChromeFeatureDependencies, 'writeClipboard'> & {
  readonly facts: () => RuntimeFacts;
};

function aboutHandlers(deps: FactsSource): ChromeHandler[] {
  const info = () => buildAboutInfo(deps.facts());
  return [
    { channel: CHROME_CHANNELS.aboutInfo, accepts: noArguments, handle: info },
    {
      channel: CHROME_CHANNELS.copyTechnicalDetails,
      accepts: noArguments,
      handle: () => deps.writeClipboard(formatTechnicalDetails(info())),
    },
  ];
}

function recoveryHandlers(recoveries: ReadonlyMap<object, Recovery>): ChromeHandler[] {
  const of = ({ sender }: ChromeCall): Recovery => {
    const recovery = [...recoveries.values()].find((candidate) => candidate.owns(sender));
    if (recovery === undefined) {
      throw new Error('No recovery screen belongs to this window.');
    }
    return recovery;
  };
  const operation = (channel: string, run: (recovery: Recovery) => unknown): ChromeHandler => ({
    channel,
    accepts: noArguments,
    handle: (call) => run(of(call)),
  });
  return [
    operation(CHROME_CHANNELS.recoveryProblem, (recovery) => recovery.problem()),
    operation(CHROME_CHANNELS.recoveryRetry, (recovery) => recovery.retry()),
    operation(CHROME_CHANNELS.recoveryClearCache, (recovery) => recovery.clearCacheAndRetry()),
    operation(CHROME_CHANNELS.recoveryCopyDiagnostics, (recovery) => recovery.copyDiagnostics()),
  ];
}

function recoveryAttacher(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  recoveries: Map<object, Recovery>,
  pages: ProbedContents[],
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
    wait: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    openPicker: (owner) => {
      const parent = deps.windowOf(owner);
      const window = openChromeWindow(windows, PICKER_PAGE, parent == null ? {} : { parent });
      return {
        webContents: window.webContents,
        close: () => {
          if (!window.isDestroyed()) {
            window.close();
          }
        },
        onClosed: (listener) => {
          window.once('closed', listener);
        },
      };
    },
  });
}

/** Acts on the account on screen. */
function accountActions(
  deps: ChromeFeatureDependencies,
  recoveries: ReadonlyMap<object, Recovery>,
  menu: AccountMenu | undefined,
  warn: (message: string) => void,
): Pick<MenuActions, 'clearCache' | 'resetSession' | 'removeAccount'> {
  const failed = (): void => {
    warn('Could not finish an account maintenance action.');
  };
  const active = (): Recovery | undefined =>
    menu === undefined ? undefined : recoveries.get(menu.activeContents());
  return {
    clearCache: () => {
      active()?.clearCacheAndRetry().catch(failed);
    },
    resetSession: () => {
      deps
        .confirmReset()
        .then((confirmed) => (confirmed ? active()?.resetSession() : undefined))
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

function diagnostics(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  page?: string,
): string {
  const info = buildAboutInfo(deps.facts());
  const updates = decideUpdatePolicy(info.channel, deps.installEvidence());
  const runtime = [`GPU ${summarizeGpu(deps.gpuStatus())}`, describeUpdatePolicy(updates)];
  return formatDiagnostics(
    info,
    page === undefined ? runtime : [...runtime, page],
    deps.recentLog(),
  );
}

/** The first WhatsApp view is the one diagnostics describe until accounts arrive. */
async function currentDiagnostics(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  pages: readonly ProbedContents[],
): Promise<string> {
  const page = pages[0];
  const state = page === undefined ? undefined : await readPageState(page);
  return diagnostics(deps, describePageState(state));
}

/** Report a Problem's operations, describing the WhatsApp views open now. */
function reportHandlers(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  pages: readonly ProbedContents[],
): ChromeHandler[] {
  return problemReportHandlers({
    diagnostics: () => currentDiagnostics(deps, pages),
    writeClipboard: deps.writeClipboard,
    openExternal: deps.openExternal,
  });
}

async function writeDiagnostics(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  pages: readonly ProbedContents[],
): Promise<unknown> {
  return deps.writeClipboard(await currentDiagnostics(deps, pages));
}

function chromeWindows(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
): ChromeWindowDependencies<PanelWindow> {
  return { createWindow: (options) => deps.createWindow(options, renderer), views, warn };
}

/** YapYap's own windows, one each: opening one again focuses it. */
type ChromeOpeners = Pick<
  MenuActions,
  | 'openAccounts'
  | 'openAbout'
  | 'openSettings'
  | 'openNewChat'
  | 'openExtensions'
  | 'installExtension'
  | 'openShortcuts'
  | 'openCustomCode'
  | 'openDownloads'
  | 'openReport'
>;

function chromeOpeners(
  windows: ChromeWindowDependencies,
  extensions: ExtensionChrome,
): ChromeOpeners {
  const opener = (page: ChromePage) => createChromeWindowOpener(windows, page);
  return {
    openAccounts: opener(ACCOUNTS_PAGE),
    openAbout: opener(ABOUT_PAGE),
    openSettings: opener(SETTINGS_PAGE),
    openNewChat: opener(NEW_CHAT_PAGE),
    openShortcuts: opener(SHORTCUTS_PAGE),
    openCustomCode: opener(CUSTOM_CODE_PAGE),
    openDownloads: opener(DOWNLOADS_PAGE),
    openExtensions: extensions.openExtensions,
    openReport: opener(REPORT_PAGE),
    installExtension: extensions.install,
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

type MenuExtensions = Pick<
  ExtensionChrome,
  'commands' | 'runCommand' | 'panels' | 'openPanel' | 'onCommandsChange' | 'refreshAssistantBar'
>;

/** The menu's actions for the accounts as they are, and the running extensions' commands. */
function menuActionsOf(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages'>,
  openers: ChromeOpeners,
  extensions: MenuExtensions,
  warn: (message: string) => void,
): (menu: AccountMenu | undefined) => MenuActions {
  const copyDiagnostics = diagnosticsCopier(deps, slots.pages, warn);
  return (menu) => ({
    ...menuAccounts(menu),
    ...openers,
    ...accountActions(deps, slots.recoveries, menu, warn),
    ...quietActions(deps.settings, menu),
    zoom: (step) => {
      changeZoom(deps.settings, step);
    },
    copyDiagnostics,
    recordTrace: deps.recordTrace,
    extensionCommands: extensions.commands(),
    runExtensionCommand: extensions.runCommand,
    extensionPanels: extensions.panels(),
    openExtensionPanel: extensions.openPanel,
  });
}

/** Calls `rebuild` when the user changes an in-app shortcut, whose keys the menu shows. */
function onShortcutChange(settings: SettingsService, rebuild: () => void): void {
  let keys = JSON.stringify(settings.current().shortcuts.custom);
  settings.onChange((current) => {
    const changed = JSON.stringify(current.shortcuts.custom);
    if (changed !== keys) {
      keys = changed;
      rebuild();
    }
  });
}

/**
 * Sets the application menu now, without accounts, and again whenever the
 * accounts, a shortcut or the running extensions change; returns how to give
 * it the accounts.
 */
function accountMenuSetter(
  deps: Omit<ChromeFeatureDependencies, 'facts'> & FactsSource,
  slots: Pick<ChromeSlots, 'recoveries' | 'pages' | 'accounts'>,
  openers: ChromeOpeners,
  extensions: MenuExtensions,
  warn: (message: string) => void,
): (menu: AccountMenu) => void {
  const actions = menuActionsOf(deps, slots, openers, extensions, warn);
  const set = (menu: AccountMenu | undefined): void => {
    deps.setMenu(
      buildMenuTemplate(deps.platform, actions(menu), deps.settings.current().shortcuts.custom),
    );
  };
  const rebuild = (): void => {
    set(slots.accounts.current);
  };
  set(undefined);
  extensions.onCommandsChange(rebuild);
  onShortcutChange(deps.settings, rebuild);
  return (menu) => {
    slots.accounts.current = menu;
    set(menu);
    // The bar's grants are per account, so another account may get another extension, or none.
    extensions.refreshAssistantBar();
  };
}

/** YapYap's own pages, served from the chrome scheme. */
function serveChromePages(deps: ChromeFeatureDependencies): void {
  const handler = createChromeHandler(deps.rendererRoot, deps.readFile);
  deps.chromeProtocol().handle(CHROME_SCHEME, handler);
}

function allHandlers(
  deps: Omit<ChromeFeatureDependencies, 'facts'> &
    FactsSource & { readonly unavailableSettings: Readonly<Record<string, string>> },
  { recoveries, pages, picker, chats, accounts, sidebar }: ChromeSlots,
): ChromeHandler[] {
  return [
    ...aboutHandlers(deps),
    ...recoveryHandlers(recoveries),
    ...reportHandlers(deps, pages),
    ...settingsHandlers(
      deps.settings,
      deps.restart,
      deps.platform,
      deps.settingEffects,
      deps.hiddenSettings,
      deps.unavailableSettings,
    ),
    ...settingsTransferHandlers(deps.settings, deps.settingsFiles),
    ...folderChoiceHandlers(deps.settings, deps.chooseFolder),
    ...newChatHandlers(chats),
    ...shortcutHandlers(deps.settings, deps.platform, deps.isGlobalShortcutRegistered),
    ...spellingHandlers(deps.settings, deps.spelling),
    ...downloadsHandlers(deps.downloads),
    ...accountsHandlers(() => accounts.current, deps.confirmRemoveAccount),
    ...customCodeHandlers(deps.customCode, () => accounts.current?.entries ?? []),
    ...sidebarHandlers(sidebar, deps.settings),
    ...picker.handlers,
  ];
}

/** Copies the diagnostics, telling the log when it cannot. */
function diagnosticsCopier(
  deps: Parameters<typeof writeDiagnostics>[0],
  pages: Parameters<typeof writeDiagnostics>[1],
  warn: (message: string) => void,
): () => void {
  return () => {
    writeDiagnostics(deps, pages).catch(() => {
      warn('Could not copy the diagnostics.');
    });
  };
}

/**
 * The accounts as extensions see them: drafts go to the active account's open
 * chat, and before there are accounts, there is no account to act on.
 */
export function extensionAccounts(accounts: AccountsSlot): ExtensionAccounts {
  return {
    insertDraft: (text) =>
      accounts.current === undefined ? Promise.resolve(false) : accounts.current.insertDraft(text),
    readActiveChat: (messages) =>
      accounts.current === undefined
        ? Promise.resolve(null)
        : accounts.current.readActiveChat(messages),
    replaceDraft: (text) =>
      accounts.current === undefined ? Promise.resolve(false) : accounts.current.replaceDraft(text),
    readDraft: () =>
      accounts.current === undefined ? Promise.resolve(null) : accounts.current.readDraft(),
    pressEnter: () =>
      accounts.current === undefined ? Promise.resolve(false) : accounts.current.pressEnter(),
    active: () => accounts.current?.entries.find((entry) => entry.active)?.id,
    list: () => (accounts.current?.entries ?? []).map(({ id, name }) => ({ id, name })),
  };
}

/** What YapYap's pages share with the main process: the pages it watches and what they act on. */
interface ChromeSlots {
  readonly recoveries: Map<object, Recovery>;
  readonly pages: ProbedContents[];
  readonly picker: SourcePicker;
  readonly chats: ChatTarget;
  readonly accounts: AccountsSlot;
  readonly sidebar: SidebarSlot;
}

function chromeSlots(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies<PanelWindow>,
): ChromeSlots {
  return {
    recoveries: new Map(),
    pages: [],
    picker: sourcePicker(deps, windows),
    chats: {},
    accounts: {},
    sidebar: {},
  };
}

/** Windows that ask or stand by: extension prompts, proxy sign-in and the quick-access panel. */
function standbyWindows(
  deps: ChromeFeatureDependencies,
  windows: ChromeWindowDependencies<PanelWindow>,
  wayland: boolean,
  accounts: AccountsSlot,
): { extensions: ExtensionChrome; proxyLogin: ProxyLoginPrompt; quickPanel: QuickPanel } {
  return {
    extensions: createExtensionChrome(
      deps.extensions,
      deps.settings,
      windows,
      extensionAccounts(accounts),
    ),
    proxyLogin: createProxyLoginPrompt(() => openPromptWindow(windows, PROXY_LOGIN_PAGE)),
    quickPanel: createQuickPanel({
      wayland,
      open: () => openChromeWindow(windows, QUICK_PANEL_PAGE),
      settings: deps.settings,
      workAreas: deps.screens,
      place: deps.quickPanelPlace,
    }),
  };
}

/** Wayland decides where windows go, so the panel's position cannot be chosen there. */
const unavailableOn = (wayland: boolean): Readonly<Record<string, string>> =>
  wayland ? { 'general.quickPanelPlace': en.settings.waylandPlacement } : {};

/** The assistant bar's view, which the extensions fill (ADR 0013). */
function assistantBarEntries(
  extensions: Pick<ExtensionChrome, 'attachAssistantBar'>,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
): Pick<ChromeRuntime, 'attachAssistantBar'> {
  return {
    attachAssistantBar: (create) => {
      extensions.attachAssistantBar(attachAssistantBar(create(renderer), views, warn));
    },
  };
}

/** What the menu and links need from the running extensions. */
function extensionEntries(
  extensions: Pick<ExtensionChrome, 'actions' | 'runCommand' | 'installFromLink'>,
): Pick<ChromeRuntime, 'extensionActions' | 'runExtensionCommand' | 'installExtensionFromLink'> {
  return {
    extensionActions: extensions.actions,
    runExtensionCommand: extensions.runCommand,
    installExtensionFromLink: extensions.installFromLink,
  };
}

/** Sets up YapYap's own pages, their operations and the menu once the app is ready. */
function startChrome(
  deps: ChromeFeatureDependencies,
  renderer: RendererOptions,
  views: ViewRegistry,
  warn: (message: string) => void,
  graphics: string,
  wayland: boolean,
): ChromeRuntime {
  const withGraphics = { ...deps, facts: () => ({ ...deps.facts(), graphics }) };
  const windows = chromeWindows(deps, renderer, views, warn);
  const slots = chromeSlots(deps, windows);
  const { recoveries, pages, picker, chats, accounts, sidebar } = slots;
  const { extensions, proxyLogin, quickPanel } = standbyWindows(deps, windows, wayland, accounts);
  const handlers = [
    ...allHandlers({ ...withGraphics, unavailableSettings: unavailableOn(wayland) }, slots),
    ...extensions.handlers,
    ...proxyLogin.handlers,
    ...quickPanel.handlers,
  ];
  registerChromeHandlers(deps.ipc, views, handlers, warn);
  const openers = chromeOpeners(windows, extensions);
  return {
    attachRecovery: recoveryAttacher(withGraphics, renderer, views, warn, recoveries, pages),
    pickCaptureSource: picker.pick,
    technicalDetails: () => formatTechnicalDetails(buildAboutInfo(withGraphics.facts())),
    openChatsWith: (open) => {
      chats.open = open;
    },
    setAccountMenu: accountMenuSetter(withGraphics, slots, openers, extensions, warn),
    openSettings: openers.openSettings,
    openWelcome: createChromeWindowOpener(windows, WELCOME_PAGE),
    openSpellingLanguages: createChromeWindowOpener(windows, SPELLING_LANGUAGES_PAGE),
    askProxyLogin: proxyLogin.ask,
    attachQuickPanel: quickPanel.attach,
    attachSidebar: (create) => attachSidebar(create(renderer), views, sidebar, warn),
    ...assistantBarEntries(extensions, renderer, views, warn),
    ...extensionEntries(extensions),
  };
}

export function createChromeFeature(deps: ChromeFeatureDependencies): ChromeFeature {
  const renderer = { preload: deps.preloadPath, partition: CHROME_PARTITION };
  return {
    beforeReady: () => {
      deps.registerSchemesAsPrivileged([
        { scheme: CHROME_SCHEME, privileges: { standard: true, secure: true } },
        // Served only on each extension's own session (ADR 0004).
        { scheme: EXTENSION_SCHEME, privileges: { standard: true, secure: true } },
      ]);
    },
    afterReady: (views, warn, graphics, wayland) => {
      serveChromePages(deps);
      return startChrome(deps, renderer, views, warn, graphics, wayland);
    },
  };
}
