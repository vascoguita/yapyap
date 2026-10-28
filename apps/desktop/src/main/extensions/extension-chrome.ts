import { compareCodeUnits } from '@yapyap/extension-sign';
import {
  CHROME_CHANNELS,
  EXTENSIONS_CHANGED_EVENT,
  type ExtensionList,
} from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import {
  createChromeWindowSlot,
  openPromptWindow,
  type ChromePage,
  type ChromeWindowDependencies,
} from '../chrome/window-opener.ts';
import {
  linkInstaller,
  marketplaceHandlers,
  type MarketplaceDependencies,
} from '../marketplace/chrome.ts';
import type { SettingsService } from '../settings/service.ts';
import { createExtensionConsent, type ConsentWindow } from './consent.ts';
import {
  installExtension,
  trustOf,
  type InstallFlowDependencies,
  type InstallOutcome,
} from './install-flow.ts';
import { commitInstall, prepareInstall } from './installer.ts';
import { grantsOf, withGrant } from './grants.ts';
import { isSettingChange, saveSetting, settingsOf } from './extension-settings.ts';
import { loadRecords, saveRecords } from './records.ts';
import { removeExtension, type RemovalDependencies } from './removal.ts';
import type { AuditLog } from './audit-log.ts';
import type { CallingExtension } from './host-methods.ts';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { RpcOptions } from './rpc.ts';
import {
  createExtensionRuntime,
  type ExtensionHost,
  type ExtensionRuntime,
  type ExtensionRuntimeDependencies,
  type ExtensionSession,
} from './runtime.ts';

const EXTENSIONS_PAGE: ChromePage = {
  path: 'extensions.html',
  window: {
    title: en.windows.extensions,
    width: 520,
    height: 480,
    minWidth: 400,
    minHeight: 320,
    minimizable: false,
    maximizable: false,
  },
};

const CONSENT_PAGE: ChromePage = {
  path: 'extension-consent.html',
  window: {
    title: en.windows.extensionConsent,
    width: 520,
    height: 620,
    minWidth: 420,
    minHeight: 420,
    minimizable: false,
    maximizable: false,
  },
};

/** A message box, as the main process shows one. */
export interface ExtensionMessage {
  readonly type: 'info' | 'error';
  readonly message: string;
  readonly detail: string;
}

export interface ExtensionChromeDependencies {
  /** Where extensions are installed, such as `<userData>/extensions`. */
  readonly root: string;
  /** Fingerprints of YapYap's own signing keys. */
  readonly anchors: ReadonlySet<string>;
  readonly chooseArchive: () => Promise<string | undefined>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly showMessage: (message: ExtensionMessage) => void;
  readonly sessionOf: (partition: string) => ExtensionSession;
  /** A hidden, sandboxed window on `partition`, which is never shown. */
  readonly createHost: (partition: string) => ExtensionHost;
  /** An extension panel's window, titled by YapYap (#98). */
  readonly createPanel: ExtensionRuntimeDependencies['createPanel'];
  /** What an extension may call, behind its capabilities (#93); drafts go to the active chat. */
  readonly methodsFor: (
    extension: CallingExtension,
    chats: Pick<ExtensionAccounts, 'insertDraft' | 'readActiveChat' | 'replaceDraft' | 'readDraft'>,
  ) => ReturnType<ExtensionRuntimeDependencies['methodsFor']>;
  readonly rpc: RpcOptions;
  /** What extensions asked YapYap to do, for the Extensions window (#99). */
  readonly audit: AuditLog;
  /** What the extensions' CPU and memory limits need (#97). */
  readonly limits: ExtensionRuntimeDependencies['limits'];
  /** Asks the user whether an extension may connect to a host it did not declare (#95). */
  readonly askHost: ExtensionRuntimeDependencies['askHost'];
  readonly confirmRemove: RemovalDependencies['confirmRemove'];
  readonly forgetData: RemovalDependencies['forgetData'];
  /** Where the marketplace lives and how to download from it (ADR 0014). */
  readonly marketplace: Omit<MarketplaceDependencies, 'root' | 'records' | 'pull' | 'install'>;
}

/** What the user is told when an install ends; a declined one ends quietly. */
export function messageOf(outcome: InstallOutcome): ExtensionMessage {
  const text = en.extensions.result;
  switch (outcome.kind) {
    case 'installed':
      return {
        type: 'info',
        message: text.installed({ name: outcome.name, version: outcome.version }),
        detail: '',
      };
    case 'rejected':
      return { type: 'error', message: text.rejected, detail: outcome.reason };
    case 'failed':
      return { type: 'error', message: text.failed, detail: '' };
  }
}

async function listExtensions(
  root: string,
  developerMode: boolean,
  audit: Pick<AuditLog, 'recent'>,
  accounts: ExtensionAccounts['list'],
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<ExtensionList> {
  const installed = await loadRecords(root);
  const listed = await Promise.all(
    [...installed.values()].map(async (record) => ({
      id: record.id,
      version: record.version,
      trust: trustOf(record),
      pulled: record.pulled ?? null,
      grants: grantsOf(record, accounts()),
      settings: await settingsOf(root, record, readFile),
    })),
  );
  const extensions = listed.toSorted((a, b) => compareCodeUnits(a.id, b.id));
  return { extensions, developerMode, activity: audit.recent() };
}

/** Saves a changed grant, and lets the running extension feel it at its next call (#94). */
async function setGrant(
  root: string,
  runtime: Pick<ExtensionRuntime, 'regrant'>,
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

/** An extension to remove, named by its ID alone. */
const isRemoval = ([id, ...rest]: readonly unknown[]): boolean =>
  rest.length === 0 && typeof id === 'string' && id.length <= MAX_CAPABILITY;

/** A grant change: an installed extension, a short capability, a listed account or none, on or off. */
function isGrantChange(
  [id, capability, account, granted, ...rest]: readonly unknown[],
  accounts: ExtensionAccounts['list'],
): boolean {
  const known = account === null || accounts().some((entry) => entry.id === account);
  const shaped =
    typeof id === 'string' && typeof capability === 'string' && capability.length <= MAX_CAPABILITY;
  return rest.length === 0 && shaped && known && typeof granted === 'boolean';
}

function extensionHandlers(
  deps: ExtensionChromeDependencies,
  settings: Pick<SettingsService, 'current'>,
  accounts: ExtensionAccounts,
  runtime: Pick<ExtensionRuntime, 'regrant' | 'forget'>,
): ChromeHandler[] {
  const list = (): Promise<ExtensionList> =>
    listExtensions(
      deps.root,
      settings.current().extensions.developerMode,
      deps.audit,
      accounts.list,
      deps.readFile,
    );
  // Each change answers with the list as it is now, so the window shows what was saved.
  const thenList =
    (change: (args: readonly unknown[]) => Promise<unknown>) =>
    async (_call: unknown, ...args: unknown[]): Promise<ExtensionList> => {
      await change(args);
      return list();
    };
  return [
    { channel: CHROME_CHANNELS.extensionsList, accepts: noArguments, handle: list },
    {
      channel: CHROME_CHANNELS.extensionsSetSetting,
      accepts: isSettingChange,
      handle: thenList((args) => saveSetting(deps.root, deps.readFile, runtime, args)),
    },
    {
      channel: CHROME_CHANNELS.extensionsSetGrant,
      accepts: (args) => isGrantChange(args, accounts.list),
      handle: thenList((args) => setGrant(deps.root, runtime, args)),
    },
    {
      channel: CHROME_CHANNELS.extensionsRemove,
      accepts: isRemoval,
      handle: thenList(([id]) => removeExtension(deps, runtime, String(id))),
    },
  ];
}

/** What extensions need of YapYap's accounts. */
export interface ExtensionAccounts {
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
  /** Every account, for per-account grants in the Extensions window (#94). */
  readonly list: () => readonly { readonly id: string; readonly name: string }[];
}

export interface ExtensionChrome {
  readonly handlers: readonly ChromeHandler[];
  /** File → Install Extension…: pick an archive, check it, ask, install. */
  readonly install: () => void;
  /** Installs the extension an **Install in YapYap** link names, from the marketplace (#389). */
  readonly installFromLink: (id: string) => void;
  readonly openExtensions: () => void;
  /** The running extensions' commands, for the menu (#98). */
  readonly commands: ExtensionRuntime['commands'];
  readonly runCommand: ExtensionRuntime['runCommand'];
  readonly onCommandsChange: ExtensionRuntime['onChange'];
  /** The running extensions' right-click items (#98). */
  readonly actions: ExtensionRuntime['actions'];
  /** The running extensions' panels, and how to open one (#98). */
  readonly panels: ExtensionRuntime['panels'];
  readonly openPanel: ExtensionRuntime['openPanel'];
}

/** The consent window, as the consent prompt drives it. */
export function openConsentWindow(windows: ChromeWindowDependencies): ConsentWindow {
  return openPromptWindow(windows, CONSENT_PAGE);
}

/** The install flow, checking archives against the extensions installed under `deps.root`. */
export function installFlow(
  deps: ExtensionChromeDependencies,
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
        developerMode: settings.current().extensions.developerMode,
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

/** The runtime that runs every installed extension, already starting them. */
function startRuntime(
  deps: ExtensionChromeDependencies,
  windows: ChromeWindowDependencies,
  accounts: ExtensionAccounts,
  failed: () => void,
): ExtensionRuntime {
  const runtime = createExtensionRuntime({
    ...deps,
    views: windows.views,
    warn: windows.warn,
    methodsFor: (extension) => deps.methodsFor(extension, accounts),
    activeAccount: accounts.active,
  });
  runtime.startAll().catch(failed);
  return runtime;
}

/** What the marketplace needs (ADR 0014), installing through the same flow as a file. */
function marketplaceOf(
  deps: ExtensionChromeDependencies,
  install: MarketplaceDependencies['install'],
  runtime: Pick<ExtensionRuntime, 'stop'>,
): MarketplaceDependencies {
  return {
    ...deps.marketplace,
    root: deps.root,
    records: () => loadRecords(deps.root),
    pull: async (pulled) => {
      const reasons = new Map(pulled.map(({ id, reason }) => [id, reason]));
      const records = [...(await loadRecords(deps.root))].map(([id, record]) => {
        const reason = reasons.get(id);
        return [id, reason === undefined ? record : { ...record, pulled: reason }] as const;
      });
      await saveRecords(deps.root, new Map(records));
      for (const id of reasons.keys()) {
        runtime.stop(id);
      }
    },
    install,
  };
}

/**
 * The Extensions window, the install command and its consent window, and the
 * runtime that runs every installed extension, starting a new one or a new
 * version as soon as it is installed (ADR 0004).
 */
export function createExtensionChrome(
  deps: ExtensionChromeDependencies,
  settings: Pick<SettingsService, 'current'>,
  windows: ChromeWindowDependencies,
  accounts: ExtensionAccounts,
): ExtensionChrome {
  const failed = (): void => {
    windows.warn('Could not read the installed extensions, so none was started.');
  };
  const runtime = startRuntime(deps, windows, accounts, failed);
  // Extensions start once their record is saved and stop once it is gone, so the window lists them again then.
  const extensionsWindow = createChromeWindowSlot(windows, EXTENSIONS_PAGE);
  runtime.onChange(() => {
    extensionsWindow.notify(EXTENSIONS_CHANGED_EVENT);
  });
  const consent = createExtensionConsent(() => openConsentWindow(windows));
  const flow = installFlow(deps, settings, consent.ask, (id) => {
    runtime.restart(id).catch(failed);
  });
  const marketplace = marketplaceOf(deps, flow, runtime);
  return {
    handlers: [
      ...extensionHandlers(deps, settings, accounts, runtime),
      ...consent.handlers,
      ...marketplaceHandlers(marketplace),
    ],
    install: () => {
      void installExtension(flow);
    },
    installFromLink: linkInstaller(marketplace),
    openExtensions: extensionsWindow.open,
    commands: runtime.commands,
    runCommand: runtime.runCommand,
    onCommandsChange: runtime.onChange,
    actions: runtime.actions,
    panels: runtime.panels,
    openPanel: runtime.openPanel,
  };
}
