import type { ExtensionHost } from '@yapyap/extension-sdk';
import { builtInProvider } from '../providers/built-in.ts';
import type { Provider } from '../providers/provider.ts';
import { modelById, modelFor, type BuiltInModel, type Catalog, type Hardware } from './catalog.ts';
import { download, savedBytes, savedModel, type DownloadOutcome } from './download.ts';
import { failureOf, type Engine } from './engine.ts';
import { BUILT_IN_KEY, builtInRecord, type BuiltInRecord } from './record.ts';
import type { ModelStore } from './store.ts';

/** Where the private model stands. */
export type Phase =
  | { readonly kind: 'none' }
  | { readonly kind: 'downloading'; readonly done: number }
  | {
      readonly kind: 'paused';
      readonly done: number;
      /** Why it stopped: '' after a restart, which leaves it paused until the user resumes. */
      readonly problem: '' | 'download-failed' | 'disk-full';
    }
  | { readonly kind: 'damaged' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'warming' }
  | { readonly kind: 'out-of-memory' };

/** The private model and where it stands. */
export interface LocalState {
  readonly model: BuiltInModel;
  readonly phase: Phase;
  /** Whether a smaller model is there to try. */
  readonly smaller: boolean;
}

/** What the bar and the panel can do with the private model. */
export interface LocalModel {
  readonly state: () => Promise<LocalState>;
  /** Bytes the models take on this computer. */
  readonly used: () => Promise<number>;
  /** Starts the download, or resumes it; returns once it has begun, and progress comes to listeners. */
  readonly download: () => Promise<void>;
  /** Swaps the model for the smaller one after it ran out of memory, and downloads that. */
  readonly smaller: () => Promise<void>;
  /** Deletes every model and forgets the choice, so another provider takes over. */
  readonly remove: () => Promise<void>;
  /** The model as a provider, which loads it on first use. */
  readonly provider: () => Provider;
  /** Calls `listener` as the model's state changes: at most once a second while downloading. */
  readonly onChange: (listener: (state: LocalState) => void) => void;
}

export interface LocalModelDependencies {
  readonly host: Pick<ExtensionHost, 'storage'>;
  readonly store: ModelStore;
  readonly engine: Engine;
  readonly fetch: typeof fetch;
  readonly hardware: () => Hardware;
  /** The models to choose from: the catalog, or a test model in an unpackaged YapYap. */
  readonly catalog: () => Promise<Catalog>;
  readonly now: () => number;
}

/** How often progress is passed on: YapYap limits how often the bar may change. */
const PROGRESS_EVERY_MS = 1000;

/** What a download that did not finish leaves the model at. */
const AFTER: Readonly<Record<Exclude<DownloadOutcome, 'done'>, (done: number) => Phase>> = {
  'download-failed': (done) => ({ kind: 'paused', done, problem: 'download-failed' }),
  'disk-full': (done) => ({ kind: 'paused', done, problem: 'disk-full' }),
  damaged: () => ({ kind: 'damaged' }),
};

/** A download under way: it has begun once the user can see where it stands. */
interface Downloading {
  readonly begun: Promise<undefined>;
  readonly done: Promise<void>;
  readonly controller: AbortController;
}

interface Live {
  /** What the model is doing now, which outlives no restart; undefined to read it from disk. */
  phase: Phase | undefined;
  /**
   * The user's choice, read once: only this page writes it, and every call
   * to YapYap counts against the extension's rate.
   */
  record: Promise<BuiltInRecord | undefined> | undefined;
  downloading: Downloading | undefined;
  loading: Promise<Engine> | undefined;
  lastProgress: number;
  readonly listeners: Set<(state: LocalState) => void>;
}

interface Context {
  readonly deps: LocalModelDependencies;
  readonly live: Live;
}

/** Keeps the user's choice, or forgets it. */
async function keep({ deps, live }: Context, model: BuiltInModel | undefined, ready = false) {
  const record = model && { model: model.id, name: model.name, ready };
  await (record === undefined
    ? deps.host.storage.delete(BUILT_IN_KEY)
    : deps.host.storage.set(BUILT_IN_KEY, record));
  live.record = Promise.resolve(record);
}

/** The record, the model it names or the one that suits the computer, and the catalog. */
async function chosen({ deps, live }: Context) {
  const catalog = await deps.catalog();
  live.record ??= deps.host.storage.get(BUILT_IN_KEY).then(builtInRecord, (error: unknown) => {
    // Read again next time, rather than keep a failure.
    live.record = undefined;
    throw error;
  });
  const record = await live.record;
  const model = modelById(record?.model, catalog) ?? modelFor(deps.hardware(), catalog);
  return { catalog, model, ready: record?.model === model.id && record.ready };
}

/** Where the model stands on disk, when nothing is under way. */
async function settled(model: BuiltInModel, ready: boolean, store: ModelStore): Promise<Phase> {
  if (ready) {
    return { kind: 'ready' };
  }
  const done = await savedBytes(model, store);
  return done > 0 ? { kind: 'paused', done, problem: '' } : { kind: 'none' };
}

async function stateOf(context: Context): Promise<LocalState> {
  const { catalog, model, ready } = await chosen(context);
  const phase = context.live.phase ?? (await settled(model, ready, context.deps.store));
  return { model, phase, smaller: model.id !== catalog.small.id };
}

/** Tells every listener, and keeps `phase` until a restart. */
async function tell(context: Context, phase: Phase | undefined): Promise<void> {
  context.live.phase = phase;
  const state = await stateOf(context);
  for (const listener of context.live.listeners) {
    listener(state);
  }
}

/** Passes progress on at most once a second, so the bar is not changed too often. */
function progress(context: Context) {
  const { deps, live } = context;
  return (done: number): void => {
    if (deps.now() - live.lastProgress < PROGRESS_EVERY_MS) {
      return;
    }
    live.lastProgress = deps.now();
    // A listener that could not be told hears the next progress, or the outcome.
    tell(context, { kind: 'downloading', done }).catch(() => undefined);
  };
}

async function fetchModel(context: Context, signal: AbortSignal, begun: () => void) {
  const { deps, live } = context;
  const { model } = await chosen(context);
  await keep(context, model);
  // Reading back what is saved takes a few seconds for a gigabyte; the user sees where it stands at once.
  await tell(context, { kind: 'downloading', done: await savedBytes(model, deps.store) });
  begun();
  live.lastProgress = deps.now();
  const outcome = await download(model, { ...deps, signal }, progress(context));
  if (outcome === 'done') {
    await keep(context, model, true);
    await tell(context, undefined);
    return;
  }
  await tell(context, AFTER[outcome](await savedBytes(model, deps.store)));
}

/** Loads the chosen model once, telling listeners it warms up; a failure lets the next request try again. */
function loading(context: Context): Promise<Engine> {
  const { deps, live } = context;
  live.loading ??= (async () => {
    await tell(context, { kind: 'warming' });
    const { model } = await chosen(context);
    await deps.engine.load(await savedModel(model, deps.store));
    await tell(context, undefined);
    return deps.engine;
  })().catch(async (error: unknown) => {
    live.loading = undefined;
    const failure = failureOf(error);
    await tell(context, failure === 'out-of-memory' ? { kind: failure } : undefined);
    throw error;
  });
  return live.loading;
}

/** Stops the download and the engine, before the model changes or goes. */
async function stop({ deps, live }: Context): Promise<void> {
  live.downloading?.controller.abort();
  await live.downloading?.done;
  live.loading = undefined;
  await deps.engine.unload();
}

/**
 * Downloads the chosen model, unless a download already runs, and returns
 * once it has begun: listeners hear the rest.
 */
function start(context: Context): Promise<void> {
  const { live } = context;
  if (live.downloading === undefined) {
    const controller = new AbortController();
    const begun = Promise.withResolvers<undefined>();
    const opened = (): void => {
      begun.resolve(undefined);
    };
    const done = fetchModel(context, controller.signal, opened)
      .catch(() => tell(context, undefined))
      .catch(() => undefined)
      .finally(() => {
        opened();
        live.downloading = undefined;
      });
    live.downloading = { begun: begun.promise, done, controller };
  }
  return live.downloading.begun;
}

/**
 * The private model on this computer (#457): downloaded once on the user's
 * click into the extension's own storage, checked against its SHA-256, and
 * run by the engine in this page. One per page, shared by the bar and the
 * panel, so the model loads and downloads once.
 */
export function localModel(deps: LocalModelDependencies): LocalModel {
  const live: Live = {
    phase: undefined,
    record: undefined,
    downloading: undefined,
    loading: undefined,
    lastProgress: -Infinity,
    listeners: new Set(),
  };
  const context: Context = { deps, live };
  return {
    state: () => stateOf(context),
    used: () => deps.store.used(),
    download: () => start(context),
    smaller: async () => {
      const { catalog, model } = await chosen(context);
      await stop(context);
      await deps.store.clear(model.sha256);
      await keep(context, catalog.small);
      return start(context);
    },
    remove: async () => {
      await stop(context);
      await deps.store.clearAll();
      await keep(context, undefined);
      await tell(context, undefined);
    },
    provider: () => builtInProvider(() => loading(context)),
    onChange: (listener) => {
      live.listeners.add(listener);
    },
  };
}
