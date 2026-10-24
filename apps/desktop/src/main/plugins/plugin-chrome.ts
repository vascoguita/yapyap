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
import { loadRecords } from './records.ts';
import type { AuditLog } from './audit-log.ts';
import type { CallingPlugin } from './host-methods.ts';
import type { RpcOptions } from './rpc.ts';
import {
  createPluginRuntime,
  type PluginHost,
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
  /** What a plugin may call, behind its capabilities (#93); drafts go to the active chat. */
  readonly methodsFor: (
    plugin: CallingPlugin,
    insertDraft: (text: string) => Promise<boolean>,
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
): Promise<PluginList> {
  const installed = await loadRecords(root);
  const records = [...installed.values()];
  const plugins = records
    .map((record) => ({ id: record.id, version: record.version, trust: trustOf(record) }))
    .sort((a, b) => compareCodeUnits(a.id, b.id));
  return { plugins, developerMode, activity: audit.recent() };
}

export interface PluginChrome {
  readonly handlers: readonly ChromeHandler[];
  /** File → Install Plugin…: pick an archive, check it, ask, install. */
  readonly install: () => void;
  readonly openPlugins: () => void;
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
  insertDraft: (text: string) => Promise<boolean>,
): PluginChrome {
  const runtime = createPluginRuntime({
    ...deps,
    views: windows.views,
    warn: windows.warn,
    methodsFor: (plugin) => deps.methodsFor(plugin, insertDraft),
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
    handlers: [
      {
        channel: CHROME_CHANNELS.pluginsList,
        accepts: noArguments,
        handle: () => listPlugins(deps.root, settings.current().plugins.developerMode, deps.audit),
      },
      ...consent.handlers,
    ],
    install: () => {
      void installPlugin(flow);
    },
    openPlugins: createChromeWindowOpener(windows, PLUGINS_PAGE),
  };
}
