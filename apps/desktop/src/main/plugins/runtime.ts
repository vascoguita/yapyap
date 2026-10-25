import { join } from 'node:path';
import { ManifestSchema, type Manifest } from '@yapyap/plugin-sdk';
import { Value } from 'typebox/value';
import type { ViewRegistry } from '../views.ts';
import { en } from '../../shared/messages/en.ts';
import { PANEL_PAGE_PATH } from '../../shared/plugin-rpc.ts';
import {
  confinePluginRequests,
  PLUGIN_SCHEME,
  pluginOrigin,
  servePluginFiles,
  type PluginSource,
} from './plugin-files.ts';
import { grantedHosts, holds } from './grants.ts';
import { hostPolicy } from './network-policy.ts';
import { formOf, valuesOf, type SettingField } from './settings-form.ts';
import { loadRecords, saveRecords, type PluginRecord } from './records.ts';
import type { AuditLog } from './audit-log.ts';
import type { CallingPlugin } from './host-methods.ts';
import {
  guardPluginResources,
  type PluginProcess,
  type ResourceGuardDependencies,
} from './resource-guard.ts';
import { servePluginRpc, type RpcMethod, type RpcOptions, type RpcPort } from './rpc.ts';

/**
 * Each plugin has a browser context of its own (ADR 0004), so plugins share
 * no process, storage, cookies or cache with each other or with WhatsApp.
 * Only `storage:local` makes it outlive a quit.
 */
/** Lets a plugin reach servers on this computer, such as a local AI model. */
const LOCAL_NETWORK = 'local-network';

export function pluginPartition(record: Pick<PluginRecord, 'id' | 'capabilities'>): string {
  const partition = `plugin:${record.id}`;
  return record.capabilities.includes('storage:local') ? `persist:${partition}` : partition;
}

export interface PluginSession {
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

/** A plugin's hidden window, which is never shown. */
export interface PluginHost {
  readonly webContents: {
    on(event: 'did-finish-load', listener: () => void): unknown;
    getOSProcessId(): number;
  };
  loadURL(url: string): Promise<unknown>;
  destroy(): void;
  /** Hands the page a fresh MessagePort, and returns the main process's end. */
  openPort(): RpcPort;
}

/** The window of a plugin's panel: its page, framed by a title YapYap sets. */
interface PluginPanelWindow {
  readonly webContents: object;
  loadURL(url: string): Promise<unknown>;
  focus(): void;
  destroy(): void;
  onClosed(listener: () => void): void;
}

export interface PluginRuntimeDependencies {
  /** Where plugins are installed, such as `<userData>/plugins`. */
  readonly root: string;
  readonly sessionOf: (partition: string) => PluginSession;
  /** A hidden, sandboxed window on `partition`. */
  readonly createHost: (partition: string) => PluginHost;
  /** A window on `partition` titled `title`, which the page cannot change (#98). */
  readonly createPanel: (partition: string, title: string) => PluginPanelWindow;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
  /** What a plugin may call, behind its capabilities (#93). */
  readonly methodsFor: (plugin: CallingPlugin) => Readonly<Record<string, RpcMethod>>;
  readonly rpc: RpcOptions;
  readonly audit: Pick<AuditLog, 'record'>;
  /** What the CPU and memory limits need besides the plugins themselves (#97). */
  readonly limits: Pick<
    ResourceGuardDependencies,
    'metrics' | 'notify' | 'every' | 'now' | 'cores'
  >;
  /** The account on screen, which account capabilities are checked against (#94). */
  readonly activeAccount: () => string | undefined;
  /** Asks the user whether `plugin` may connect to `host` (#95). */
  readonly askHost: (plugin: string, host: string) => Promise<boolean>;
}

export interface PluginRuntime {
  /** Starts every installed plugin; resolves once each has been asked to load. */
  readonly startAll: () => Promise<void>;
  /** Starts a plugin again, as after an update. */
  readonly restart: (id: string) => Promise<void>;
  readonly running: () => readonly string[];
  /** Each running plugin's renderer process, for the resource guard (#97). */
  readonly processes: () => readonly PluginProcess[];
  /** Stops a plugin until it is started again. */
  readonly stop: (id: string) => void;
  /** Reads a plugin's grants again after the user changed them (#94). */
  readonly regrant: (id: string) => Promise<void>;
  /** Stops a plugin being removed for good, and deletes what its sessions kept (#332). */
  readonly forget: (id: string) => Promise<void>;
  /** The running plugins' commands, for the menu (#98). */
  readonly commands: () => readonly PluginCommand[];
  /** The running plugins' composer actions and context-menu items, for right clicks (#98). */
  readonly actions: () => readonly PluginAction[];
  /** Runs a command the user picked; false when its plugin is not ready for it. */
  readonly runCommand: (plugin: string, command: string) => boolean;
  /** The running plugins' panels, for the menu (#98). */
  readonly panels: () => readonly PluginPanel[];
  /** Opens a plugin's panel, or brings it forward; false when it has none. */
  readonly openPanel: (plugin: string) => boolean;
  /** Calls `listener` whenever plugins start or stop. */
  readonly onChange: (listener: () => void) => void;
}

/** Where a plugin's menu item shows: the message box, a message, or a chat in the list. */
type PluginActionPlace = 'composer' | 'message' | 'chat';

/** A menu item a running plugin adds to right clicks, running one of its commands. */
export interface PluginAction {
  readonly plugin: string;
  readonly pluginName: string;
  readonly command: string;
  readonly title: string;
  readonly on: PluginActionPlace;
}

/** A panel a running plugin offers. */
export interface PluginPanel {
  readonly plugin: string;
  readonly pluginName: string;
  readonly title: string;
}

/** A command a running plugin offers. */
export interface PluginCommand {
  readonly plugin: string;
  readonly pluginName: string;
  readonly id: string;
  readonly title: string;
}

/** The installed manifest, or undefined when the file is missing or not a manifest. */
export async function manifestIn(
  folder: string,
  readFile: PluginRuntimeDependencies['readFile'],
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
 * Hands each page the plugin loads a port of its own, and serves its calls
 * there with the grants the plugin holds (ADR 0004).
 */
function connect(
  deps: PluginRuntimeDependencies,
  running: RunningPlugin,
  known: KnownPlugin,
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
    servePluginRpc(running.port, granted, methods, deps.rpc, (call) => {
      deps.audit.record({ ...call, plugin: id });
    });
  });
}

/** A plugin's name and its record as it stands now, grants and hosts included. */
interface KnownPlugin {
  name: string;
  record: PluginRecord;
  /** The settings form its manifest declares, which saved values must fit. */
  form: readonly SettingField[];
}

/** Adds `host` to the plugin's record, so the approval outlives a restart. */
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

/** A running plugin: its window, its name and commands, and the port its page holds now. */
interface RunningPlugin {
  readonly host: PluginHost;
  readonly name: string;
  readonly commands: readonly { readonly id: string; readonly title: string }[];
  readonly actions: readonly Omit<PluginAction, 'plugin' | 'pluginName'>[];
  readonly partition: string;
  /** The panel's title, if the plugin has one. */
  readonly panel: string | undefined;
  port?: RpcPort;
  panelWindow?: PluginPanelWindow;
}

interface RuntimeState {
  /** Each running plugin's window, and its name from its manifest. */
  readonly hosts: Map<string, RunningPlugin>;
  readonly sources: Map<string, PluginSource>;
  /** Each plugin's name and current record, which its calls and requests are checked against. */
  readonly known: Map<string, KnownPlugin>;
  /** Sessions that already serve their plugin: a scheme is handled once per session. */
  readonly served: Set<string>;
  /** Told whenever the running plugins change, so the menu can list their commands. */
  readonly listeners: Set<() => void>;
}

/** Serves the plugin's files on its own session, and nothing from anywhere else. */
function serve(
  deps: PluginRuntimeDependencies,
  state: RuntimeState,
  id: string,
  partition: string,
  known: KnownPlugin,
) {
  if (state.served.has(partition)) {
    return;
  }
  state.served.add(partition);
  const session = deps.sessionOf(partition);
  session.protocol.handle(
    PLUGIN_SCHEME,
    servePluginFiles(id, () => state.sources.get(id), deps.readFile),
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
  session.webRequest.onBeforeRequest(confinePluginRequests(decide));
}

/** What YapYap keeps of a plugin it started: its window, and what its manifest contributes. */
function runningPlugin(host: PluginHost, partition: string, manifest: Manifest): RunningPlugin {
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
  deps: PluginRuntimeDependencies,
  state: RuntimeState,
  record: PluginRecord,
): Promise<void> {
  closeRunning(state, record.id);
  const folder = join(deps.root, record.id, record.version);
  const manifest = await manifestIn(folder, deps.readFile);
  if (manifest === undefined) {
    deps.warn(`Plugin ${record.id} has no readable manifest, so it was not started.`);
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
  const partition = pluginPartition(record);
  serve(deps, state, record.id, partition, known);
  const host = deps.createHost(partition);
  const home = pluginOrigin(record.id);
  deps.views.set(host.webContents, { home, zone: 'plugin', label: record.id });
  const running = runningPlugin(host, partition, manifest);
  state.hosts.set(record.id, running);
  changed(state);
  connect(deps, running, known);
  await host.loadURL(`${home}/`).catch(() => {
    deps.warn(`Plugin ${record.id} could not be loaded.`);
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

/** Reads a plugin's record again, so its next call and request see the grants as they are now. */
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

/** Closes a running plugin's window and its panel, if open. */
function closeRunning(state: RuntimeState, id: string): void {
  const running = state.hosts.get(id);
  running?.host.destroy();
  running?.panelWindow?.destroy();
  state.hosts.delete(id);
}

function stopPlugin(state: RuntimeState, id: string): void {
  closeRunning(state, id);
  changed(state);
}

/**
 * Both partitions a plugin may have had: an update can add or drop
 * `storage:local`, which moves it from one to the other.
 */
async function forget(
  deps: PluginRuntimeDependencies,
  state: RuntimeState,
  id: string,
): Promise<void> {
  stopPlugin(state, id);
  state.sources.delete(id);
  state.known.delete(id);
  const partition = pluginPartition({ id, capabilities: [] });
  await Promise.all(
    [partition, `persist:${partition}`].map(async (each) => {
      const session = deps.sessionOf(each);
      await Promise.all([session.clearStorageData(), session.clearCache()]);
    }),
  );
}

/** The panels of the plugins that run, in the order they started. */
function panelsOf(state: RuntimeState): PluginPanel[] {
  return [...state.hosts].flatMap(([plugin, { name, panel }]) =>
    panel === undefined ? [] : [{ plugin, pluginName: name, title: panel }],
  );
}

/**
 * Opens a plugin's panel in a window of its own, on the plugin's session
 * and under its CSP, titled with the plugin's name, so it never passes for
 * WhatsApp or YapYap (ADR 0004). A panel already open comes forward.
 */
function openPanel(deps: PluginRuntimeDependencies, state: RuntimeState, plugin: string): boolean {
  const running = state.hosts.get(plugin);
  if (running?.panel === undefined) {
    return false;
  }
  if (running.panelWindow !== undefined) {
    running.panelWindow.focus();
    return true;
  }
  const window = deps.createPanel(
    running.partition,
    en.menu.pluginCommand(running.name, running.panel),
  );
  const home = pluginOrigin(plugin);
  deps.views.set(window.webContents, { home, zone: 'plugin', label: plugin });
  running.panelWindow = window;
  // A new window is made only once this one is gone, so this one is still the panel.
  window.onClosed(() => {
    delete running.panelWindow;
  });
  window.loadURL(`${home}${PANEL_PAGE_PATH}`).catch(() => {
    deps.warn(`The panel of plugin ${plugin} could not be loaded.`);
  });
  return true;
}

/** The commands of the plugins that run, in the order they started. */
function commandsOf(state: RuntimeState): PluginCommand[] {
  return [...state.hosts].flatMap(([plugin, { name, commands }]) =>
    commands.map(({ id, title }) => ({ pluginName: name, plugin, id, title })),
  );
}

/**
 * A plugin's composer actions and context-menu items, keeping only those
 * that name a command it declares, since only those can run.
 */
function actionsOf(manifest: Manifest): RunningPlugin['actions'] {
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

/** The menu items of the plugins that run, in the order they started. */
function pluginActionsOf(state: RuntimeState): PluginAction[] {
  return [...state.hosts].flatMap(([plugin, { name, actions }]) =>
    actions.map((action) => ({ ...action, plugin, pluginName: name })),
  );
}

/** Asks a running plugin to run one of the commands it declared; false when it cannot. */
function runCommand(state: RuntimeState, plugin: string, command: string): boolean {
  const running = state.hosts.get(plugin);
  if (running?.port === undefined || !running.commands.some(({ id }) => id === command)) {
    return false;
  }
  running.port.postMessage({ command });
  return true;
}

function processesOf(state: RuntimeState): PluginProcess[] {
  return [...state.hosts].map(([id, { host, name }]) => ({
    id,
    name,
    pid: host.webContents.getOSProcessId(),
  }));
}

/** What YapYap's menus show of the running plugins, and how they run a command. */
function contributionsOf(
  state: RuntimeState,
): Pick<PluginRuntime, 'commands' | 'actions' | 'runCommand' | 'panels' | 'onChange'> {
  return {
    panels: () => panelsOf(state),
    commands: () => commandsOf(state),
    actions: () => pluginActionsOf(state),
    runCommand: (plugin, command) => runCommand(state, plugin, command),
    onChange: (listener) => {
      state.listeners.add(listener);
    },
  };
}

/**
 * Runs each installed plugin in its own hidden, sandboxed window (ADR 0004,
 * #92). Its code comes only from `plugin://<id>/`, under a CSP that allows
 * no eval, inline or remote scripts, and every other request it makes is
 * cancelled.
 */
export function createPluginRuntime(deps: PluginRuntimeDependencies): PluginRuntime {
  const state = newState();
  const restart = async (id: string): Promise<void> => {
    const records = await loadRecords(deps.root);
    const record = records.get(id);
    if (record !== undefined) {
      await start(deps, state, record);
    }
  };
  const runtime: PluginRuntime = {
    restart,
    startAll: async () => {
      const records = await loadRecords(deps.root);
      await Promise.all([...records.values()].map((record) => start(deps, state, record)));
    },
    running: () => [...state.hosts.keys()],
    processes: () => processesOf(state),
    stop: (id) => {
      stopPlugin(state, id);
    },
    ...contributionsOf(state),
    openPanel: (plugin) => openPanel(deps, state, plugin),
    regrant: (id) => regrant(deps.root, state, id),
    forget: (id) => forget(deps, state, id),
  };
  guardPluginResources({
    ...deps.limits,
    running: runtime.processes,
    restart: (id) => {
      restart(id).catch(() => {
        deps.warn(`Plugin ${id} could not be restarted.`);
      });
    },
    stop: runtime.stop,
    warn: deps.warn,
  });
  return runtime;
}
