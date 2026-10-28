import { join } from 'node:path';
import { ManifestSchema, type AssistantRequest, type Manifest } from '@yapyap/extension-sdk';
import { Value } from 'typebox/value';
import type { ViewRegistry } from '../views.ts';
import { en } from '../../shared/messages/en.ts';
import { PANEL_PAGE_PATH } from '../../shared/extension-rpc.ts';
import {
  confineExtensionRequests,
  EXTENSION_SCHEME,
  extensionOrigin,
  serveExtensionFiles,
  type ExtensionSource,
} from './extension-files.ts';
import { grantedHosts, holds } from './grants.ts';
import { hostPolicy } from './network-policy.ts';
import { formOf, valuesOf, type SettingField } from './settings-form.ts';
import { loadRecords, saveRecords, type ExtensionRecord } from './records.ts';
import type { AuditLog } from './audit-log.ts';
import type { CallingExtension } from './host-methods.ts';
import {
  guardExtensionResources,
  type ExtensionProcess,
  type ResourceGuardDependencies,
} from './resource-guard.ts';
import { serveExtensionRpc, type RpcMethod, type RpcOptions, type RpcPort } from './rpc.ts';

/**
 * Each extension has a browser context of its own (ADR 0004), so extensions share
 * no process, storage, cookies or cache with each other or with WhatsApp.
 * Only `storage:local` makes it outlive a quit.
 */
/** Lets an extension reach servers on this computer, such as a local AI model. */
const LOCAL_NETWORK = 'local-network';

export function extensionPartition(record: Pick<ExtensionRecord, 'id' | 'capabilities'>): string {
  const partition = `extension:${record.id}`;
  return record.capabilities.includes('storage:local') ? `persist:${partition}` : partition;
}

export interface ExtensionSession {
  readonly protocol: {
    handle(scheme: string, handler: (request: { readonly url: string }) => Promise<Response>): void;
  };
  readonly webRequest: {
    onBeforeRequest(
      listener: (
        details: { readonly url: string },
        callback: (response: { cancel: boolean }) => void,
      ) => void,
    ): void;
  };
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

/** An extension's hidden window, which is never shown. */
export interface ExtensionHost {
  readonly webContents: {
    on(event: 'did-finish-load', listener: () => void): unknown;
    getOSProcessId(): number;
  };
  loadURL(url: string): Promise<unknown>;
  destroy(): void;
  /** Hands the page a fresh MessagePort, and returns the main process's end. */
  openPort(): RpcPort;
}

/** The window of an extension's panel: its page, framed by a title YapYap sets. */
interface ExtensionPanelWindow {
  readonly webContents: object;
  loadURL(url: string): Promise<unknown>;
  focus(): void;
  destroy(): void;
  onClosed(listener: () => void): void;
}

export interface ExtensionRuntimeDependencies {
  /** Where extensions are installed, such as `<userData>/extensions`. */
  readonly root: string;
  readonly sessionOf: (partition: string) => ExtensionSession;
  /** A hidden, sandboxed window on `partition`. */
  readonly createHost: (partition: string) => ExtensionHost;
  /** A window on `partition` titled `title`, which the page cannot change (#98). */
  readonly createPanel: (partition: string, title: string) => ExtensionPanelWindow;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
  /** What an extension may call, behind its capabilities (#93). */
  readonly methodsFor: (extension: CallingExtension) => Readonly<Record<string, RpcMethod>>;
  readonly rpc: RpcOptions;
  readonly audit: Pick<AuditLog, 'record'>;
  /** What the CPU and memory limits need besides the extensions themselves (#97). */
  readonly limits: Pick<
    ResourceGuardDependencies,
    'metrics' | 'notify' | 'every' | 'now' | 'cores'
  >;
  /** The account on screen, which account capabilities are checked against (#94). */
  readonly activeAccount: () => string | undefined;
  /** Asks the user whether `extension` may connect to `host` (#95). */
  readonly askHost: (extension: string, host: string) => Promise<boolean>;
}

export interface ExtensionRuntime {
  /** Starts every installed extension; resolves once each has been asked to load. */
  readonly startAll: () => Promise<void>;
  /** Starts an extension again, as after an update. */
  readonly restart: (id: string) => Promise<void>;
  readonly running: () => readonly string[];
  /** Each running extension's renderer process, for the resource guard (#97). */
  readonly processes: () => readonly ExtensionProcess[];
  /** Stops an extension until it is started again. */
  readonly stop: (id: string) => void;
  /** Reads an extension's grants again after the user changed them (#94). */
  readonly regrant: (id: string) => Promise<void>;
  /** Stops an extension being removed for good, and deletes what its sessions kept (#332). */
  readonly forget: (id: string) => Promise<void>;
  /** The running extensions' commands, for the menu (#98). */
  readonly commands: () => readonly ExtensionCommand[];
  /** The running extensions' composer actions and context-menu items, for right clicks (#98). */
  readonly actions: () => readonly ExtensionAction[];
  /** Runs a command the user picked; false when its extension is not ready for it. */
  readonly runCommand: (extension: string, command: string) => boolean;
  /** The running extensions' panels, for the menu (#98). */
  readonly panels: () => readonly ExtensionPanel[];
  /** Opens an extension's panel, or brings it forward; false when it has none. */
  readonly openPanel: (extension: string) => boolean;
  /** Calls `listener` whenever extensions start or stop. */
  readonly onChange: (listener: () => void) => void;
  /** Running extensions holding `assistant:bar` for the account on screen, in start order (ADR 0013). */
  readonly assistants: () => readonly { readonly id: string; readonly name: string }[];
  /** Passes an assistant bar request to the extension; false when it may not take one. */
  readonly askAssistant: (extension: string, request: AssistantRequest) => boolean;
}

/** Where an extension's menu item shows: the message box, a message, or a chat in the list. */
type ExtensionActionPlace = 'composer' | 'message' | 'chat';

/** A menu item a running extension adds to right clicks, running one of its commands. */
export interface ExtensionAction {
  readonly extension: string;
  readonly extensionName: string;
  readonly command: string;
  readonly title: string;
  readonly on: ExtensionActionPlace;
}

/** A panel a running extension offers. */
export interface ExtensionPanel {
  readonly extension: string;
  readonly extensionName: string;
  readonly title: string;
}

/** A command a running extension offers. */
export interface ExtensionCommand {
  readonly extension: string;
  readonly extensionName: string;
  readonly id: string;
  readonly title: string;
}

/** The installed manifest, or undefined when the file is missing or not a manifest. */
export async function manifestIn(
  folder: string,
  readFile: ExtensionRuntimeDependencies['readFile'],
): Promise<Manifest | undefined> {
  try {
    const manifest: unknown = JSON.parse(
      new TextDecoder().decode(await readFile(join(folder, 'manifest.json'))),
    );
    return Value.Check(ManifestSchema, manifest) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hands each page the extension loads a port of its own, and serves its calls
 * there with the grants the extension holds (ADR 0004).
 */
function connect(
  deps: ExtensionRuntimeDependencies,
  running: RunningExtension,
  known: KnownExtension,
): void {
  const { id } = known.record;
  const methods = deps.methodsFor({
    id,
    name: known.name,
    settings: () => valuesOf(known.form, known.record.settings),
  });
  // Grants are read on every call, so taking one back stops the next call (#94).
  const granted = (capability: string): boolean =>
    holds(known.record, capability, deps.activeAccount());
  running.host.webContents.on('did-finish-load', () => {
    running.port = running.host.openPort();
    serveExtensionRpc(running.port, granted, methods, deps.rpc, (call) => {
      deps.audit.record({ ...call, extension: id });
    });
  });
}

/** An extension's name and its record as it stands now, grants and hosts included. */
interface KnownExtension {
  name: string;
  record: ExtensionRecord;
  /** The settings form its manifest declares, which saved values must fit. */
  form: readonly SettingField[];
}

/** Adds `host` to the extension's record, so the approval outlives a restart. */
async function approveHost(root: string, id: string, host: string): Promise<void> {
  const records = await loadRecords(root);
  const record = records.get(id);
  if (record !== undefined) {
    await saveRecords(
      root,
      new Map(records).set(id, { ...record, hosts: [...record.hosts, host] }),
    );
  }
}

/** A running extension: its window, its name and commands, and the port its page holds now. */
interface RunningExtension {
  readonly host: ExtensionHost;
  readonly name: string;
  readonly commands: readonly { readonly id: string; readonly title: string }[];
  readonly actions: readonly Omit<ExtensionAction, 'extension' | 'extensionName'>[];
  readonly partition: string;
  /** The panel's title, if the extension has one. */
  readonly panel: string | undefined;
  port?: RpcPort;
  panelWindow?: ExtensionPanelWindow;
}

interface RuntimeState {
  /** Each running extension's window, and its name from its manifest. */
  readonly hosts: Map<string, RunningExtension>;
  readonly sources: Map<string, ExtensionSource>;
  /** Each extension's name and current record, which its calls and requests are checked against. */
  readonly known: Map<string, KnownExtension>;
  /** Sessions that already serve their extension: a scheme is handled once per session. */
  readonly served: Set<string>;
  /** Told whenever the running extensions change, so the menu can list their commands. */
  readonly listeners: Set<() => void>;
}

/** Serves the extension's files on its own session, and nothing from anywhere else. */
function serve(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  id: string,
  partition: string,
  known: KnownExtension,
) {
  if (state.served.has(partition)) {
    return;
  }
  state.served.add(partition);
  const session = deps.sessionOf(partition);
  session.protocol.handle(
    EXTENSION_SCHEME,
    serveExtensionFiles(id, () => state.sources.get(id), deps.readFile),
  );
  const decide = hostPolicy({
    id,
    name: () => known.name,
    approved: () => grantedHosts(known.record),
    local: () => holds(known.record, LOCAL_NETWORK, undefined),
    ask: deps.askHost,
    approve: async (host) => {
      known.record = { ...known.record, hosts: [...known.record.hosts, host] };
      await approveHost(deps.root, id, host);
    },
  });
  session.webRequest.onBeforeRequest(confineExtensionRequests(decide));
}

/** What YapYap keeps of an extension it started: its window, and what its manifest contributes. */
function runningExtension(
  host: ExtensionHost,
  partition: string,
  manifest: Manifest,
): RunningExtension {
  return {
    host,
    partition,
    name: manifest.name,
    commands: manifest.contributes?.commands ?? [],
    actions: actionsOf(manifest),
    panel: manifest.contributes?.panel?.title,
  };
}

async function start(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  record: ExtensionRecord,
): Promise<void> {
  closeRunning(state, record.id);
  if (record.pulled !== undefined) {
    return;
  }
  const folder = join(deps.root, record.id, record.version);
  const manifest = await manifestIn(folder, deps.readFile);
  if (manifest === undefined) {
    deps.warn(`Extension ${record.id} has no readable manifest, so it was not started.`);
    return;
  }
  state.sources.set(record.id, {
    folder,
    entry: manifest.entry,
    panel: manifest.contributes?.panel?.entry,
  });
  const form = formOf(manifest.contributes?.settings);
  const known = state.known.get(record.id) ?? { name: manifest.name, record, form };
  known.name = manifest.name;
  known.form = form;
  known.record = record;
  state.known.set(record.id, known);
  const partition = extensionPartition(record);
  serve(deps, state, record.id, partition, known);
  const host = deps.createHost(partition);
  const home = extensionOrigin(record.id);
  deps.views.set(host.webContents, { home, zone: 'extension', label: record.id });
  const running = runningExtension(host, partition, manifest);
  state.hosts.set(record.id, running);
  changed(state);
  connect(deps, running, known);
  await host.loadURL(`${home}/`).catch(() => {
    deps.warn(`Extension ${record.id} could not be loaded.`);
  });
}

function newState(): RuntimeState {
  return {
    hosts: new Map(),
    sources: new Map(),
    known: new Map(),
    served: new Set(),
    listeners: new Set(),
  };
}

/** Reads an extension's record again, so its next call and request see the grants as they are now. */
async function regrant(root: string, state: RuntimeState, id: string): Promise<void> {
  const records = await loadRecords(root);
  const record = records.get(id);
  const known = state.known.get(id);
  if (record !== undefined && known !== undefined) {
    known.record = record;
  }
}

const changed = (state: RuntimeState): void => {
  for (const listener of state.listeners) {
    listener();
  }
};

/** Closes a running extension's window and its panel, if open. */
function closeRunning(state: RuntimeState, id: string): void {
  const running = state.hosts.get(id);
  running?.host.destroy();
  running?.panelWindow?.destroy();
  state.hosts.delete(id);
}

function stopExtension(state: RuntimeState, id: string): void {
  closeRunning(state, id);
  changed(state);
}

/**
 * Both partitions an extension may have had: an update can add or drop
 * `storage:local`, which moves it from one to the other.
 */
async function forget(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  id: string,
): Promise<void> {
  stopExtension(state, id);
  state.sources.delete(id);
  state.known.delete(id);
  const partition = extensionPartition({ id, capabilities: [] });
  await Promise.all(
    [partition, `persist:${partition}`].map(async (each) => {
      const session = deps.sessionOf(each);
      await Promise.all([session.clearStorageData(), session.clearCache()]);
    }),
  );
}

/** The panels of the extensions that run, in the order they started. */
function panelsOf(state: RuntimeState): ExtensionPanel[] {
  return [...state.hosts].flatMap(([extension, { name, panel }]) =>
    panel === undefined ? [] : [{ extension, extensionName: name, title: panel }],
  );
}

/**
 * Opens an extension's panel in a window of its own, on the extension's session
 * and under its CSP, titled with the extension's name, so it never passes for
 * WhatsApp or YapYap (ADR 0004). A panel already open comes forward.
 */
function openPanel(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  extension: string,
): boolean {
  const running = state.hosts.get(extension);
  if (running?.panel === undefined) {
    return false;
  }
  if (running.panelWindow !== undefined) {
    running.panelWindow.focus();
    return true;
  }
  const window = deps.createPanel(
    running.partition,
    en.menu.extensionCommand({ extension: running.name, title: running.panel }),
  );
  const home = extensionOrigin(extension);
  deps.views.set(window.webContents, { home, zone: 'extension', label: extension });
  running.panelWindow = window;
  // A new window is made only once this one is gone, so this one is still the panel.
  window.onClosed(() => {
    delete running.panelWindow;
  });
  window.loadURL(`${home}${PANEL_PAGE_PATH}`).catch(() => {
    deps.warn(`The panel of extension ${extension} could not be loaded.`);
  });
  return true;
}

/** The commands of the extensions that run, in the order they started. */
function commandsOf(state: RuntimeState): ExtensionCommand[] {
  return [...state.hosts].flatMap(([extension, { name, commands }]) =>
    commands.map(({ id, title }) => ({ extensionName: name, extension, id, title })),
  );
}

/**
 * An extension's composer actions and context-menu items, keeping only those
 * that name a command it declares, since only those can run.
 */
function actionsOf(manifest: Manifest): RunningExtension['actions'] {
  const contributes = manifest.contributes;
  const declared = new Set((contributes?.commands ?? []).map(({ id }) => id));
  const items = [
    ...(contributes?.composerActions ?? []).map((action) => ({
      ...action,
      on: 'composer' as const,
    })),
    ...(contributes?.contextMenu ?? []),
  ];
  return items.filter(({ command }) => declared.has(command));
}

/** The menu items of the extensions that run, in the order they started. */
function extensionActionsOf(state: RuntimeState): ExtensionAction[] {
  return [...state.hosts].flatMap(([extension, { name, actions }]) =>
    actions.map((action) => ({ ...action, extension, extensionName: name })),
  );
}

const ASSISTANT_BAR = 'assistant:bar';

/** The running extensions that may fill the assistant bar for the account on screen. */
function assistantsOf(
  deps: Pick<ExtensionRuntimeDependencies, 'activeAccount'>,
  state: RuntimeState,
): { id: string; name: string }[] {
  return [...state.hosts].flatMap(([id, { name }]) => {
    const known = state.known.get(id);
    return known !== undefined && holds(known.record, ASSISTANT_BAR, deps.activeAccount())
      ? [{ id, name }]
      : [];
  });
}

/** Hands an assistant bar request to an extension that may take one now. */
function askAssistant(
  deps: Pick<ExtensionRuntimeDependencies, 'activeAccount'>,
  state: RuntimeState,
  extension: string,
  request: AssistantRequest,
): boolean {
  const port = state.hosts.get(extension)?.port;
  if (port === undefined || !assistantsOf(deps, state).some(({ id }) => id === extension)) {
    return false;
  }
  port.postMessage({ assistant: request });
  return true;
}

/** Asks a running extension to run one of the commands it declared; false when it cannot. */
function runCommand(state: RuntimeState, extension: string, command: string): boolean {
  const running = state.hosts.get(extension);
  if (running?.port === undefined || !running.commands.some(({ id }) => id === command)) {
    return false;
  }
  running.port.postMessage({ command });
  return true;
}

function processesOf(state: RuntimeState): ExtensionProcess[] {
  return [...state.hosts].map(([id, { host, name }]) => ({
    id,
    name,
    pid: host.webContents.getOSProcessId(),
  }));
}

/** What YapYap's menus show of the running extensions, and how they run a command. */
function contributionsOf(
  state: RuntimeState,
): Pick<ExtensionRuntime, 'commands' | 'actions' | 'runCommand' | 'panels' | 'onChange'> {
  return {
    panels: () => panelsOf(state),
    commands: () => commandsOf(state),
    actions: () => extensionActionsOf(state),
    runCommand: (extension, command) => runCommand(state, extension, command),
    onChange: (listener) => {
      state.listeners.add(listener);
    },
  };
}

/**
 * Runs each installed extension in its own hidden, sandboxed window (ADR 0004,
 * #92). Its code comes only from `extension://<id>/`, under a CSP that allows
 * no eval, inline or remote scripts, and every other request it makes is
 * cancelled.
 */
export function createExtensionRuntime(deps: ExtensionRuntimeDependencies): ExtensionRuntime {
  const state = newState();
  const restart = async (id: string): Promise<void> => {
    const records = await loadRecords(deps.root);
    const record = records.get(id);
    if (record !== undefined) {
      await start(deps, state, record);
    }
  };
  const runtime: ExtensionRuntime = {
    restart,
    startAll: async () => {
      const records = await loadRecords(deps.root);
      await Promise.all([...records.values()].map((record) => start(deps, state, record)));
    },
    running: () => [...state.hosts.keys()],
    processes: () => processesOf(state),
    stop: (id) => {
      stopExtension(state, id);
    },
    ...contributionsOf(state),
    openPanel: (extension) => openPanel(deps, state, extension),
    assistants: () => assistantsOf(deps, state),
    askAssistant: (extension, request) => askAssistant(deps, state, extension, request),
    regrant: (id) => regrant(deps.root, state, id),
    forget: (id) => forget(deps, state, id),
  };
  guardExtensionResources({
    ...deps.limits,
    running: runtime.processes,
    restart: (id) => {
      restart(id).catch(() => {
        deps.warn(`Extension ${id} could not be restarted.`);
      });
    },
    stop: runtime.stop,
    warn: deps.warn,
  });
  return runtime;
}
