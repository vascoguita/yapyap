import { join } from 'node:path';
import { ManifestSchema, type Manifest } from '@yapyap/extension-sdk';
import { Value } from 'typebox/value';
import type { ViewRegistry } from '../security/views.ts';
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
import { loopbackCors } from './loopback-cors.ts';
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
    onBeforeSendHeaders(
      listener: (
        details: { readonly url: string; readonly requestHeaders: Record<string, string> },
        callback: (response: { requestHeaders: Record<string, string> }) => void,
      ) => void,
    ): void;
    onHeadersReceived(
      listener: (
        details: {
          readonly url: string;
          readonly method: string;
          readonly responseHeaders?: Record<string, string[]>;
        },
        callback: (response: {
          responseHeaders?: Record<string, string[]>;
          statusLine?: string;
        }) => void,
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
  /** Asks the user whether `extension` may use `server` on this computer (#430). */
  readonly askLocal: (extension: string, server: string) => Promise<boolean>;
  /** What every session does to request headers, kept by the extension's own listener. */
  readonly presentHeaders: (headers: Readonly<Record<string, string>>) => Record<string, string>;
}

export interface ExtensionRuntime {
  /**
   * Reads every installed extension, so the menus list what it contributes,
   * and starts those that run from launch; resolves once each has been asked to load.
   */
  readonly startAll: () => Promise<void>;
  /** Starts an extension again, as after an update. */
  readonly restart: (id: string) => Promise<void>;
  /** The extensions whose renderer runs now. */
  readonly running: () => readonly string[];
  /** Each running extension's renderer process, for the resource guard (#97). */
  readonly processes: () => readonly ExtensionProcess[];
  /** Stops an extension until it is started again. */
  readonly stop: (id: string) => void;
  /** Reads an extension's grants again after the user changed them (#94). */
  readonly regrant: (id: string) => Promise<void>;
  /** Stops an extension being removed for good, and deletes what its sessions kept (#332). */
  readonly forget: (id: string) => Promise<void>;
  /** The installed extensions' commands, for the menu (#98), whether or not they run. */
  readonly commands: () => readonly ExtensionCommand[];
  /** The installed extensions' composer actions and context-menu items, for right clicks (#98). */
  readonly actions: () => readonly ExtensionAction[];
  /** Runs a command the user picked, starting its extension if needed; false when it has no such command. */
  readonly runCommand: (extension: string, command: string) => boolean;
  /** The installed extensions' panels, for the menu (#98). */
  readonly panels: () => readonly ExtensionPanel[];
  /** Opens an extension's panel, starting the extension if needed, or brings it forward; false when it has none. */
  readonly openPanel: (extension: string) => boolean;
  /** Calls `listener` whenever extensions are read or stopped, so their contributions change. */
  readonly onChange: (listener: () => void) => void;
}

/** Where an extension's menu item shows: the message box, a message, or a chat in the list. */
type ExtensionActionPlace = 'composer' | 'message' | 'chat';

/** A menu item an installed extension adds to right clicks, running one of its commands. */
export interface ExtensionAction {
  readonly extension: string;
  readonly extensionName: string;
  readonly command: string;
  readonly title: string;
  readonly on: ExtensionActionPlace;
}

/** A panel an installed extension offers. */
export interface ExtensionPanel {
  readonly extension: string;
  readonly extensionName: string;
  readonly title: string;
}

/** A command an installed extension offers. */
export interface ExtensionCommand {
  readonly extension: string;
  readonly extensionName: string;
  readonly id: string;
  readonly title: string;
  /** The keys the manifest suggests, which the menu uses only where nothing else has them. */
  readonly shortcut?: string | undefined;
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
 * there with the grants the extension holds (ADR 0004). Commands picked while
 * the page loaded go out once it has its port.
 */
function connect(
  deps: ExtensionRuntimeDependencies,
  loaded: LoadedExtension,
  renderer: Renderer,
): void {
  const { known } = loaded;
  const { id } = known.record;
  const methods = deps.methodsFor({
    id,
    name: known.name,
    settings: () => valuesOf(known.form, known.record.settings),
  });
  // Grants are read on every call, so taking one back stops the next call (#94).
  const granted = (capability: string): boolean =>
    holds(known.record, capability, deps.activeAccount());
  renderer.host.webContents.on('did-finish-load', () => {
    const port = renderer.host.openPort();
    renderer.port = port;
    serveExtensionRpc(port, granted, methods, deps.rpc, (call) => {
      deps.audit.record({ ...call, extension: id });
    });
    // Every call counts as use, so an extension at work is never stopped as idle.
    port.on('message', () => {
      loaded.active = deps.limits.now();
    });
    for (const command of renderer.queued.splice(0)) {
      port.postMessage({ command });
    }
  });
}

/** An extension's name and its record as it stands now, grants and hosts included. */
interface KnownExtension {
  name: string;
  record: ExtensionRecord;
  /** The settings form its manifest declares, which saved values must fit. */
  form: readonly SettingField[];
}

type Approval = (record: ExtensionRecord) => ExtensionRecord;

const withHost =
  (host: string): Approval =>
  (record) => ({ ...record, hosts: [...record.hosts, host] });

const withLocalServer =
  (server: string): Approval =>
  (record) => ({ ...record, localServers: [...(record.localServers ?? []), server] });

/** Writes an approval into the extension's record, so it outlives a restart. */
async function remember(root: string, id: string, approval: Approval): Promise<void> {
  const records = await loadRecords(root);
  const record = records.get(id);
  if (record !== undefined) {
    await saveRecords(root, new Map(records).set(id, approval(record)));
  }
}

/** An extension's hidden window while it runs, and the port its page holds now. */
interface Renderer {
  readonly host: ExtensionHost;
  port?: RpcPort;
  /** Commands the user picked before the page had its port. */
  readonly queued: string[];
}

/**
 * An installed extension YapYap has read: what its manifest contributes,
 * which the menus list whether or not it runs, and its renderer while it does.
 */
interface LoadedExtension {
  readonly name: string;
  /** What YapYap knows of it, whose grants are read again whenever they change. */
  readonly known: KnownExtension;
  readonly commands: readonly {
    readonly id: string;
    readonly title: string;
    readonly shortcut?: string;
  }[];
  readonly actions: readonly Omit<ExtensionAction, 'extension' | 'extensionName'>[];
  readonly partition: string;
  /** The panel's title, if the extension has one. */
  readonly panel: string | undefined;
  /** Whether it runs from launch to quit, as it asked, rather than only while needed (#495). */
  readonly always: boolean;
  renderer?: Renderer;
  panelWindow?: ExtensionPanelWindow;
  /** When it was last started, used or had its panel closed, for stopping it once idle. */
  active: number;
}

interface RuntimeState {
  /** Each extension read from its manifest, in the order they were read, running or not. */
  readonly loaded: Map<string, LoadedExtension>;
  readonly sources: Map<string, ExtensionSource>;
  /** Each extension's name and current record, which its calls and requests are checked against. */
  readonly known: Map<string, KnownExtension>;
  /** Sessions that already serve their extension: a scheme is handled once per session. */
  readonly served: Set<string>;
  /** Told whenever the running extensions change, so the menu can list their commands. */
  readonly listeners: Set<() => void>;
}

/** The extension's files, from the version that runs now. */
const filesOf = (deps: ExtensionRuntimeDependencies, state: RuntimeState, id: string) =>
  serveExtensionFiles(id, () => state.sources.get(id), deps.readFile);

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
  session.protocol.handle(EXTENSION_SCHEME, filesOf(deps, state, id));
  const approve = async (approval: Approval): Promise<void> => {
    known.record = approval(known.record);
    await remember(deps.root, id, approval);
  };
  const local = {
    local: () => holds(known.record, LOCAL_NETWORK, undefined),
    approvedLocal: () => known.record.localServers ?? [],
  };
  const decide = hostPolicy({
    ...local,
    id,
    name: () => known.name,
    approved: () => grantedHosts(known.record),
    ask: deps.askHost,
    approve: (host) => approve(withHost(host)),
    askLocal: deps.askLocal,
    approveLocal: (server) => approve(withLocalServer(server)),
  });
  session.webRequest.onBeforeRequest(confineExtensionRequests(decide));
  answerLocalServers(session, loopbackCors({ ...local, id, present: deps.presentHeaders }));
}

/** Lets approved servers on this computer answer the extension's page (#430). */
function answerLocalServers(
  session: ExtensionSession,
  cors: ReturnType<typeof loopbackCors>,
): void {
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: cors.beforeSendHeaders(details) });
  });
  session.webRequest.onHeadersReceived((details, callback) => {
    callback(cors.headersReceived(details));
  });
}

/** What YapYap keeps of an extension it read: what its manifest contributes, before it runs. */
function loadedExtension(
  partition: string,
  manifest: Manifest,
  known: KnownExtension,
  now: number,
): LoadedExtension {
  return {
    partition,
    known,
    name: manifest.name,
    commands: manifest.contributes?.commands ?? [],
    actions: actionsOf(manifest),
    panel: manifest.contributes?.panel?.title,
    always: manifest.activation !== 'on-demand',
    active: now,
  };
}

/**
 * Starts an extension's hidden window, unless it runs already, and resolves
 * once the window was asked to load its page.
 */
function wake(deps: ExtensionRuntimeDependencies, loaded: LoadedExtension): Promise<void> {
  loaded.active = deps.limits.now();
  if (loaded.renderer !== undefined) {
    return Promise.resolve();
  }
  const { id } = loaded.known.record;
  const host = deps.createHost(loaded.partition);
  const home = extensionOrigin(id);
  deps.views.set(host.webContents, { home, zone: 'extension', label: id });
  const renderer: Renderer = { host, queued: [] };
  loaded.renderer = renderer;
  connect(deps, loaded, renderer);
  return host.loadURL(`${home}/`).then(
    () => undefined,
    () => {
      deps.warn(`Extension ${id} could not be loaded.`);
    },
  );
}

/**
 * Reads an installed extension's manifest, so the menus list what it
 * contributes, and starts it only if it asked to run from launch (#495).
 */
async function start(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  record: ExtensionRecord,
): Promise<void> {
  unload(state, record.id);
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
  const loaded = loadedExtension(partition, manifest, known, deps.limits.now());
  state.loaded.set(record.id, loaded);
  changed(state);
  if (loaded.always) {
    await wake(deps, loaded);
  }
}

function newState(): RuntimeState {
  return {
    loaded: new Map(),
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

/** Closes an extension's window and its panel, if open, and forgets what its manifest contributes. */
function unload(state: RuntimeState, id: string): void {
  const loaded = state.loaded.get(id);
  loaded?.renderer?.host.destroy();
  loaded?.panelWindow?.destroy();
  state.loaded.delete(id);
}

function stopExtension(state: RuntimeState, id: string): void {
  unload(state, id);
  changed(state);
}

/** How long an on-demand extension may sit unused before its renderer stops (#495). */
export const EXTENSION_IDLE_MS = 300_000;
/** How often idle extensions are looked for: a stop may come up to this much after the idle time. */
const IDLE_CHECK_MS = 60_000;

/**
 * Stops the renderer of each on-demand extension that made no call, ran no
 * command and showed no panel for {@link EXTENSION_IDLE_MS}. Its commands,
 * menu items and panel stay listed, and the next one it is needed for starts it again.
 */
function sleepIdle(deps: ExtensionRuntimeDependencies, state: RuntimeState): void {
  const now = deps.limits.now();
  for (const loaded of state.loaded.values()) {
    const idle = now - loaded.active >= EXTENSION_IDLE_MS;
    if (!loaded.always && loaded.panelWindow === undefined && idle) {
      loaded.renderer?.host.destroy();
      delete loaded.renderer;
    }
  }
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

/** The panels of the installed extensions, in the order they were read. */
function panelsOf(state: RuntimeState): ExtensionPanel[] {
  return [...state.loaded].flatMap(([extension, { name, panel }]) =>
    panel === undefined ? [] : [{ extension, extensionName: name, title: panel }],
  );
}

/**
 * Opens an extension's panel in a window of its own, on the extension's session
 * and under its CSP, titled with the extension's name, so it never passes for
 * WhatsApp or YapYap (ADR 0004). A panel already open comes forward. The panel
 * reaches the host API only through the hidden page, so that starts too.
 */
function openPanel(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  extension: string,
): boolean {
  const loaded = state.loaded.get(extension);
  if (loaded?.panel === undefined) {
    return false;
  }
  if (loaded.panelWindow !== undefined) {
    loaded.panelWindow.focus();
    return true;
  }
  void wake(deps, loaded);
  const window = deps.createPanel(
    loaded.partition,
    en.menu.extensionCommand({ extension: loaded.name, title: loaded.panel }),
  );
  const home = extensionOrigin(extension);
  deps.views.set(window.webContents, { home, zone: 'extension', label: extension });
  loaded.panelWindow = window;
  // A new window is made only once this one is gone, so this one is still the panel.
  window.onClosed(() => {
    delete loaded.panelWindow;
    loaded.active = deps.limits.now();
  });
  window.loadURL(`${home}${PANEL_PAGE_PATH}`).catch(() => {
    deps.warn(`The panel of extension ${extension} could not be loaded.`);
  });
  return true;
}

/** The commands of the installed extensions, in the order they were read. */
function commandsOf(state: RuntimeState): ExtensionCommand[] {
  return [...state.loaded].flatMap(([extension, { name, commands }]) =>
    commands.map(({ id, title, shortcut }) => ({
      extensionName: name,
      extension,
      id,
      title,
      shortcut,
    })),
  );
}

/**
 * An extension's composer actions and context-menu items, keeping only those
 * that name a command it declares, since only those can run.
 */
function actionsOf(manifest: Manifest): LoadedExtension['actions'] {
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

/** The menu items of the installed extensions, in the order they were read. */
function extensionActionsOf(state: RuntimeState): ExtensionAction[] {
  return [...state.loaded].flatMap(([extension, { name, actions }]) =>
    actions.map((action) => ({ ...action, extension, extensionName: name })),
  );
}

/**
 * Asks an extension to run one of the commands it declared, starting it
 * first if it is not running; false when it declared no such command.
 */
function runCommand(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  extension: string,
  command: string,
): boolean {
  const loaded = state.loaded.get(extension);
  if (loaded?.commands.some(({ id }) => id === command) !== true) {
    return false;
  }
  void wake(deps, loaded);
  const renderer = loaded.renderer;
  if (renderer?.port === undefined) {
    renderer?.queued.push(command);
  } else {
    renderer.port.postMessage({ command });
  }
  return true;
}

function processesOf(state: RuntimeState): ExtensionProcess[] {
  return [...state.loaded].flatMap(([id, { renderer, name }]) =>
    renderer === undefined ? [] : [{ id, name, pid: renderer.host.webContents.getOSProcessId() }],
  );
}

/** What YapYap's menus show of the installed extensions, and how they run a command. */
function contributionsOf(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
): Pick<ExtensionRuntime, 'commands' | 'actions' | 'runCommand' | 'panels' | 'onChange'> {
  return {
    panels: () => panelsOf(state),
    commands: () => commandsOf(state),
    actions: () => extensionActionsOf(state),
    runCommand: (extension, command) => runCommand(deps, state, extension, command),
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
    running: () => [...state.loaded].flatMap(([id, { renderer }]) => (renderer ? [id] : [])),
    processes: () => processesOf(state),
    stop: (id) => {
      stopExtension(state, id);
    },
    ...contributionsOf(deps, state),
    openPanel: (extension) => openPanel(deps, state, extension),
    regrant: (id) => regrant(deps.root, state, id),
    forget: (id) => forget(deps, state, id),
  };
  watch(deps, state, runtime);
  return runtime;
}

/** Restarts or stops extensions over their limits (#97), and stops idle on-demand ones (#495). */
function watch(
  deps: ExtensionRuntimeDependencies,
  state: RuntimeState,
  runtime: ExtensionRuntime,
): void {
  guardExtensionResources({
    ...deps.limits,
    running: runtime.processes,
    restart: (id) => {
      runtime.restart(id).catch(() => {
        deps.warn(`Extension ${id} could not be restarted.`);
      });
    },
    stop: runtime.stop,
    warn: deps.warn,
  });
  deps.limits.every(() => {
    sleepIdle(deps, state);
  }, IDLE_CHECK_MS);
}
