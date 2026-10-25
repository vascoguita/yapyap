import { compareCodeUnits } from '@yapyap/plugin-sign';
import { CHROME_CHANNELS, type PluginList } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import {
  createChromeWindowOpener,
  openPromptWindow,
  type ChromePage,
  type ChromeWindowDependencies,
} from '../chrome/window-opener.ts';
import type { SettingsService } from '../settings/service.ts';
import { createPluginConsent, type ConsentWindow } from './consent.ts';
import {
  installPlugin,
  trustOf,
  type InstallFlowDependencies,
  type InstallOutcome,
} from './install-flow.ts';
import { commitInstall, prepareInstall } from './installer.ts';
import { grantsOf, withGrant } from './grants.ts';
import { isSettingChange, saveSetting, settingsOf } from './plugin-settings.ts';
import { loadRecords, saveRecords } from './records.ts';
import type { AuditLog } from './audit-log.ts';
import type { CallingPlugin } from './host-methods.ts';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { RpcOptions } from './rpc.ts';
import {
  createPluginRuntime,
  type PluginHost,
  type PluginRuntime,
  type PluginRuntimeDependencies,
  type PluginSession,
} from './runtime.ts';

const PLUGINS_PAGE: ChromePage = {
  path: 'plugins.html',
  window: {
    title: en.windows.plugins,
    width: 520,
    height: 480,
    minWidth: 400,
    minHeight: 320,
    minimizable: false,
    maximizable: false,
  },
};

const CONSENT_PAGE: ChromePage = {
  path: 'plugin-consent.html',
  window: {
    title: en.windows.pluginConsent,
    width: 520,
    height: 620,
    minWidth: 420,
    minHeight: 420,
    minimizable: false,
    maximizable: false,
  },
};

/** A message box, as the main process shows one. */
export interface PluginMessage {
  readonly type: 'info' | 'error';
  readonly message: string;
  readonly detail: string;
}

export interface PluginChromeDependencies {
  /** Where plugins are installed, such as `<userData>/plugins`. */
  readonly root: string;
  /** Fingerprints of YapYap's own signing keys. */
  readonly anchors: ReadonlySet<string>;
  readonly chooseArchive: () => Promise<string | undefined>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly showMessage: (message: PluginMessage) => void;
  readonly sessionOf: (partition: string) => PluginSession;
  /** A hidden, sandboxed window on `partition`, which is never shown. */
  readonly createHost: (partition: string) => PluginHost;
  /** A plugin panel's window, titled by YapYap (#98). */
  readonly createPanel: PluginRuntimeDependencies['createPanel'];
  /** What a plugin may call, behind its capabilities (#93); drafts go to the active chat. */
  readonly methodsFor: (
    plugin: CallingPlugin,
    chats: Pick<PluginAccounts, 'insertDraft' | 'readActiveChat' | 'replaceDraft' | 'readDraft'>,
  ) => ReturnType<PluginRuntimeDependencies['methodsFor']>;
  readonly rpc: RpcOptions;
  /** What plugins asked YapYap to do, for the Plugins window (#99). */
  readonly audit: AuditLog;
  /** What the plugins' CPU and memory limits need (#97). */
  readonly limits: PluginRuntimeDependencies['limits'];
  /** Asks the user whether a plugin may connect to a host it did not declare (#95). */
  readonly askHost: PluginRuntimeDependencies['askHost'];
}

/** What the user is told when an install ends; a declined one ends quietly. */
export function messageOf(outcome: InstallOutcome): PluginMessage {
  const text = en.plugins.result;
  switch (outcome.kind) {
    case 'installed':
      return { type: 'info', message: text.installed(outcome.name, outcome.version), detail: '' };
    case 'rejected':
      return { type: 'error', message: text.rejected, detail: outcome.reason };
    case 'failed':
      return { type: 'error', message: text.failed, detail: '' };
  }
}

async function listPlugins(
  root: string,
  developerMode: boolean,
  audit: Pick<AuditLog, 'recent'>,
  accounts: PluginAccounts['list'],
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<PluginList> {
  const installed = await loadRecords(root);
  const listed = await Promise.all(
    [...installed.values()].map(async (record) => ({
      id: record.id,
      version: record.version,
      trust: trustOf(record),
      grants: grantsOf(record, accounts()),
      settings: await settingsOf(root, record, readFile),
    })),
  );
  const plugins = listed.toSorted((a, b) => compareCodeUnits(a.id, b.id));
  return { plugins, developerMode, activity: audit.recent() };
}

/** Saves a changed grant, and lets the running plugin feel it at its next call (#94). */
async function setGrant(
  root: string,
  runtime: Pick<PluginRuntime, 'regrant'>,
  [id, capability, account, granted]: readonly unknown[],
): Promise<void> {
  const records = await loadRecords(root);
  const record = records.get(String(id));
  if (record !== undefined) {
    const scope = typeof account === 'string' ? account : undefined;
    const changed = withGrant(record, String(capability), scope, granted === true);
    await saveRecords(root, new Map(records).set(record.id, changed));
    await runtime.regrant(record.id);
  }
}

/** Longer than any capability or `network:<host>` grant. */
const MAX_CAPABILITY = 300;

/** A grant change: an installed plugin, a short capability, a listed account or none, on or off. */
function isGrantChange(
  [id, capability, account, granted, ...rest]: readonly unknown[],
  accounts: PluginAccounts['list'],
): boolean {
  const known = account === null || accounts().some((entry) => entry.id === account);
  const shaped =
    typeof id === 'string' && typeof capability === 'string' && capability.length <= MAX_CAPABILITY;
  return rest.length === 0 && shaped && known && typeof granted === 'boolean';
}

function pluginHandlers(
  deps: PluginChromeDependencies,
  settings: Pick<SettingsService, 'current'>,
  accounts: PluginAccounts,
  runtime: Pick<PluginRuntime, 'regrant'>,
): ChromeHandler[] {
  const list = (): Promise<PluginList> =>
    listPlugins(
      deps.root,
      settings.current().plugins.developerMode,
      deps.audit,
      accounts.list,
      deps.readFile,
    );
  return [
    { channel: CHROME_CHANNELS.pluginsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.pluginsSetSetting,
      accepts: isSettingChange,
      handle: async (_call, ...args) => {
        await saveSetting(deps.root, deps.readFile, runtime, args);
        return list();
      },
    },
    {
      channel: CHROME_CHANNELS.pluginsSetGrant,
      accepts: (args) => isGrantChange(args, accounts.list),
      handle: async (_call, ...args) => {
        await setGrant(deps.root, runtime, args);
        return list();
      },
    },
  ];
}

/** What plugins need of YapYap's accounts. */
export interface PluginAccounts {
  /** Puts a draft in the active account's open chat; false when none is open. */
  readonly insertDraft: (text: string) => Promise<boolean>;
  /** The active account's open chat and its last `messages` messages; null when none is open. */
  readonly readActiveChat: (messages: number) => Promise<ReadChat | null>;
  /** Replaces the active account's draft; false when no chat is open. */
  readonly replaceDraft: (text: string) => Promise<boolean>;
  /** The active account's draft; null when no chat is open. */
  readonly readDraft: () => Promise<string | null>;
  /** The account on screen. */
  readonly active: () => string | undefined;
  /** Every account, for per-account grants in the Plugins window (#94). */
  readonly list: () => readonly { readonly id: string; readonly name: string }[];
}

export interface PluginChrome {
  readonly handlers: readonly ChromeHandler[];
  /** File → Install Plugin…: pick an archive, check it, ask, install. */
  readonly install: () => void;
  readonly openPlugins: () => void;
  /** The running plugins' commands, for the menu (#98). */
  readonly commands: PluginRuntime['commands'];
  readonly runCommand: PluginRuntime['runCommand'];
  readonly onCommandsChange: PluginRuntime['onChange'];
  /** The running plugins' right-click items (#98). */
  readonly actions: PluginRuntime['actions'];
  /** The running plugins' panels, and how to open one (#98). */
  readonly panels: PluginRuntime['panels'];
  readonly openPanel: PluginRuntime['openPanel'];
}

/** The consent window, as the consent prompt drives it. */
export function openConsentWindow(windows: ChromeWindowDependencies): ConsentWindow {
  return openPromptWindow(windows, CONSENT_PAGE);
}

/** The install flow, checking archives against the plugins installed under `deps.root`. */
export function installFlow(
  deps: PluginChromeDependencies,
  settings: Pick<SettingsService, 'current'>,
  ask: InstallFlowDependencies['ask'],
  started: (id: string) => void,
): InstallFlowDependencies {
  return {
    chooseArchive: deps.chooseArchive,
    readFile: deps.readFile,
    prepare: (bytes) =>
      prepareInstall({
        root: deps.root,
        anchors: deps.anchors,
        developerMode: settings.current().plugins.developerMode,
        bytes,
      }),
    commit: async (install) => {
      const folder = await commitInstall(deps.root, install);
      started(install.decision.request.id);
      return folder;
    },
    report: (outcome) => {
      deps.showMessage(messageOf(outcome));
    },
    ask,
  };
}

/**
 * The Plugins window, the install command and its consent window, and the
 * runtime that runs every installed plugin, starting a new one or a new
 * version as soon as it is installed (ADR 0004).
 */
export function createPluginChrome(
  deps: PluginChromeDependencies,
  settings: Pick<SettingsService, 'current'>,
  windows: ChromeWindowDependencies,
  accounts: PluginAccounts,
): PluginChrome {
  const runtime = createPluginRuntime({
    ...deps,
    views: windows.views,
    warn: windows.warn,
    methodsFor: (plugin) => deps.methodsFor(plugin, accounts),
    activeAccount: accounts.active,
  });
  const failed = (): void => {
    windows.warn('Could not read the installed plugins, so none was started.');
  };
  runtime.startAll().catch(failed);
  const consent = createPluginConsent(() => openConsentWindow(windows));
  const flow = installFlow(deps, settings, consent.ask, (id) => {
    runtime.restart(id).catch(failed);
  });
  return {
    handlers: [...pluginHandlers(deps, settings, accounts, runtime), ...consent.handlers],
    install: () => {
      void installPlugin(flow);
    },
    openPlugins: createChromeWindowOpener(windows, PLUGINS_PAGE),
    commands: runtime.commands,
    runCommand: runtime.runCommand,
    onCommandsChange: runtime.onChange,
    actions: runtime.actions,
    panels: runtime.panels,
    openPanel: runtime.openPanel,
  };
}
