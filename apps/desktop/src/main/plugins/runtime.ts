import { join } from 'node:path';
import { ManifestSchema, type Manifest } from '@yapyap/plugin-sdk';
import { Value } from 'typebox/value';
import type { ViewRegistry } from '../views.ts';
import {
  confinePluginRequests,
  PLUGIN_SCHEME,
  pluginOrigin,
  servePluginFiles,
  type PluginSource,
} from './plugin-files.ts';
import { loadRecords, type PluginRecord } from './records.ts';
import { servePluginRpc, type RpcMethod, type RpcOptions, type RpcPort } from './rpc.ts';

/**
 * Each plugin has a browser context of its own (ADR 0004), so plugins share
 * no process, storage, cookies or cache with each other or with WhatsApp.
 * Only `storage:local` makes it outlive a quit.
 */
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
}

/** A plugin's hidden window, which is never shown. */
export interface PluginHost {
  readonly webContents: { on(event: 'did-finish-load', listener: () => void): unknown };
  loadURL(url: string): Promise<unknown>;
  destroy(): void;
  /** Hands the page a fresh MessagePort, and returns the main process's end. */
  openPort(): RpcPort;
}

export interface PluginRuntimeDependencies {
  /** Where plugins are installed, such as `<userData>/plugins`. */
  readonly root: string;
  readonly sessionOf: (partition: string) => PluginSession;
  /** A hidden, sandboxed window on `partition`. */
  readonly createHost: (partition: string) => PluginHost;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly views: ViewRegistry;
  readonly warn: (message: string) => void;
  /** What a plugin may call, behind its capabilities (#93). */
  readonly methodsFor: (plugin: { readonly name: string }) => Readonly<Record<string, RpcMethod>>;
  readonly rpc: RpcOptions;
}

export interface PluginRuntime {
  /** Starts every installed plugin; resolves once each has been asked to load. */
  readonly startAll: () => Promise<void>;
  /** Starts a plugin again, as after an update. */
  readonly restart: (id: string) => Promise<void>;
  readonly running: () => readonly string[];
}

/** The installed manifest, or undefined when the file is missing or not a manifest. */
async function manifestIn(
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
  host: PluginHost,
  record: PluginRecord,
  manifest: Manifest,
): void {
  const methods = deps.methodsFor({ name: manifest.name });
  const granted = new Set<string>(record.capabilities);
  host.webContents.on('did-finish-load', () => {
    servePluginRpc(host.openPort(), granted, methods, deps.rpc);
  });
}

interface RuntimeState {
  readonly hosts: Map<string, PluginHost>;
  readonly sources: Map<string, PluginSource>;
  /** Sessions that already serve their plugin: a scheme is handled once per session. */
  readonly served: Set<string>;
}

/** Serves the plugin's files on its own session, and nothing from anywhere else. */
function serve(
  deps: PluginRuntimeDependencies,
  state: RuntimeState,
  id: string,
  partition: string,
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
  session.webRequest.onBeforeRequest(confinePluginRequests(id));
}

async function start(
  deps: PluginRuntimeDependencies,
  state: RuntimeState,
  record: PluginRecord,
): Promise<void> {
  state.hosts.get(record.id)?.destroy();
  state.hosts.delete(record.id);
  const folder = join(deps.root, record.id, record.version);
  const manifest = await manifestIn(folder, deps.readFile);
  if (manifest === undefined) {
    deps.warn(`Plugin ${record.id} has no readable manifest, so it was not started.`);
    return;
  }
  state.sources.set(record.id, { folder, entry: manifest.entry });
  const partition = pluginPartition(record);
  serve(deps, state, record.id, partition);
  const host = deps.createHost(partition);
  const home = pluginOrigin(record.id);
  deps.views.set(host.webContents, { home, zone: 'plugin', label: record.id });
  state.hosts.set(record.id, host);
  connect(deps, host, record, manifest);
  await host.loadURL(`${home}/`).catch(() => {
    deps.warn(`Plugin ${record.id} could not be loaded.`);
  });
}

/**
 * Runs each installed plugin in its own hidden, sandboxed window (ADR 0004,
 * #92). Its code comes only from `plugin://<id>/`, under a CSP that allows
 * no eval, inline or remote scripts, and every other request it makes is
 * cancelled.
 */
export function createPluginRuntime(deps: PluginRuntimeDependencies): PluginRuntime {
  const state: RuntimeState = { hosts: new Map(), sources: new Map(), served: new Set() };
  return {
    startAll: async () => {
      const records = await loadRecords(deps.root);
      await Promise.all([...records.values()].map((record) => start(deps, state, record)));
    },
    restart: async (id) => {
      const records = await loadRecords(deps.root);
      const record = records.get(id);
      if (record !== undefined) {
        await start(deps, state, record);
      }
    },
    running: () => [...state.hosts.keys()],
  };
}
