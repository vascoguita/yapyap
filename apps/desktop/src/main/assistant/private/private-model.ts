import type { AssistantState } from '../state.ts';
import { modelById, modelFor, type Catalog, type Hardware, type PrivateModel } from './catalog.ts';
import { download, type DownloadOutcome } from './download.ts';
import type { ModelFiles } from './files.ts';

/** Where the private model stands. */
type Phase =
  | { readonly kind: 'none' }
  | { readonly kind: 'downloading'; readonly done: number }
  | {
      readonly kind: 'paused';
      readonly done: number;
      /** Why it stopped: '' when the user paused it or YapYap restarted meanwhile. */
      readonly problem: '' | 'failed' | 'disk-full';
    }
  | { readonly kind: 'damaged' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'out-of-memory' };

/** The private model, where it stands, and what it takes on disk. */
export interface PrivateModelStatus {
  readonly model: PrivateModel;
  readonly phase: Phase;
  /** Whether a smaller model is there to try. */
  readonly smaller: boolean;
  /** Bytes the models take on this computer. */
  readonly used: number;
}

/** The private model on this computer (#457), downloaded and checked by the main process. */
export interface PrivateModels {
  readonly status: () => Promise<PrivateModelStatus>;
  /** The downloaded model, if it is all there and matched its hash. */
  readonly ready: () => PrivateModel | undefined;
  /** Its file, for the engine page, while it is ready. */
  readonly file: () => string | undefined;
  /** Starts the download, or resumes it; progress comes to listeners. */
  readonly download: () => void;
  /** Pauses the download, keeping what came. */
  readonly pause: () => void;
  /** Swaps the model for the smaller one, after it ran out of memory, and downloads that. */
  readonly smaller: () => Promise<void>;
  /** Deletes every model and forgets the choice. */
  readonly remove: () => Promise<void>;
  /** Notes that the model did not fit in memory, so the smaller one is offered. */
  readonly outOfMemory: () => void;
  /** Calls `listener` as the model changes: at most once a second while it downloads. */
  readonly onChange: (listener: () => void) => void;
}

export interface PrivateModelDependencies {
  readonly state: Pick<AssistantState, 'privateModel' | 'setPrivateModel'>;
  readonly files: ModelFiles;
  /** The assistant's confined `fetch` (ADR 0017). */
  readonly fetch: typeof globalThis.fetch;
  readonly catalog: Catalog;
  readonly hardware: () => Hardware;
  /** Frees the engine, before the model changes or goes. */
  readonly closeEngine: () => void;
  readonly now: () => number;
}

/** How often progress is passed on: the bar need not change more often. */
const PROGRESS_EVERY_MS = 1000;

/** What a download that did not finish leaves the model at. */
const AFTER: Readonly<Record<Exclude<DownloadOutcome, 'done'>, (done: number) => Phase>> = {
  paused: (done) => ({ kind: 'paused', problem: '', done }),
  failed: (done) => ({ kind: 'paused', problem: 'failed', done }),
  'disk-full': (done) => ({ kind: 'paused', problem: 'disk-full', done }),
  damaged: () => ({ kind: 'damaged' }),
};

interface Live {
  /** What the model is doing now, which outlives no restart; undefined to read it from disk. */
  phase: Phase | undefined;
  downloading: AbortController | undefined;
  /** The download under way, which settles once it stopped writing. */
  running: Promise<void>;
  lastProgress: number;
  readonly listeners: Set<() => void>;
}

interface Context {
  readonly deps: PrivateModelDependencies;
  readonly live: Live;
}

/** The model the user chose, or the one that suits the computer, and whether it is all there. */
function chosen({ deps }: Context): { readonly model: PrivateModel; readonly ready: boolean } {
  const record = deps.state.privateModel();
  const model = modelById(record?.id, deps.catalog) ?? modelFor(deps.hardware(), deps.catalog);
  return { model, ready: record?.id === model.id && record.ready };
}

/** Where the model stands on disk, when nothing is under way. */
async function settled(context: Context): Promise<Phase> {
  const { model, ready } = chosen(context);
  if (ready) {
    return { kind: 'ready' };
  }
  const done = await context.deps.files.saved(model);
  return done > 0 ? { kind: 'paused', problem: '', done } : { kind: 'none' };
}

function tell(context: Context, phase: Phase | undefined): void {
  context.live.phase = phase;
  for (const listener of context.live.listeners) {
    listener();
  }
}

/** Passes progress on at most once a second. */
function progress(context: Context): (done: number) => void {
  const { deps, live } = context;
  return (done) => {
    live.phase = { kind: 'downloading', done };
    if (deps.now() - live.lastProgress >= PROGRESS_EVERY_MS) {
      live.lastProgress = deps.now();
      tell(context, live.phase);
    }
  };
}

async function fetchModel(context: Context, controller: AbortController): Promise<void> {
  const { deps } = context;
  const { model } = chosen(context);
  deps.state.setPrivateModel({ id: model.id, ready: false });
  tell(context, { kind: 'downloading', done: await deps.files.saved(model) });
  const files = { files: deps.files, fetch: deps.fetch, signal: controller.signal };
  const outcome = await download(model, files, progress(context));
  if (outcome === 'done') {
    deps.state.setPrivateModel({ id: model.id, ready: true });
    tell(context, undefined);
    return;
  }
  tell(context, AFTER[outcome](await deps.files.saved(model)));
}

function start(context: Context): void {
  const { live } = context;
  if (live.downloading !== undefined) {
    return;
  }
  const controller = new AbortController();
  live.downloading = controller;
  // Settings reads the state as soon as the click returns, before the saved bytes are counted.
  live.phase = { kind: 'downloading', done: 0 };
  live.running = fetchModel(context, controller)
    .catch(() => {
      tell(context, undefined);
    })
    .finally(() => {
      live.downloading = undefined;
    });
}

/** Swaps the model for the smaller one, deleting the other, and downloads it. */
async function smaller(context: Context): Promise<void> {
  const { deps } = context;
  await stop(context);
  await deps.files.clear();
  deps.state.setPrivateModel({ id: deps.catalog.small.id, ready: false });
  start(context);
}

/** Deletes every model and forgets the choice, so another provider takes over. */
async function remove(context: Context): Promise<void> {
  await stop(context);
  await context.deps.files.clear();
  context.deps.state.setPrivateModel(undefined);
  tell(context, undefined);
}

async function statusOf(context: Context): Promise<PrivateModelStatus> {
  const { model } = chosen(context);
  return {
    model,
    phase: context.live.phase ?? (await settled(context)),
    smaller: model.id !== context.deps.catalog.small.id,
    used: await context.deps.files.used(),
  };
}

/** Stops the download and the engine, before the model changes or goes. */
async function stop({ deps, live }: Context): Promise<void> {
  live.downloading?.abort();
  await live.running;
  deps.closeEngine();
}

/**
 * The private model on this computer (#457): downloaded on the user's
 * click into `<userData>/models/`, checked against its SHA-256, and run by
 * the engine window. The choice and whether it is ready live in
 * `assistant.json`; a download in progress outlives no restart, but what
 * it kept does, and resuming carries on from there.
 */
export function privateModels(deps: PrivateModelDependencies): PrivateModels {
  const live: Live = {
    phase: undefined,
    downloading: undefined,
    running: Promise.resolve(),
    lastProgress: -Infinity,
    listeners: new Set(),
  };
  const context: Context = { deps, live };
  const ready = (): PrivateModel | undefined => {
    const { model, ready: done } = chosen(context);
    return done ? model : undefined;
  };
  return {
    ready,
    status: () => statusOf(context),
    file: () => {
      const model = ready();
      return model === undefined ? undefined : deps.files.path(model);
    },
    download: () => {
      start(context);
    },
    pause: () => {
      live.downloading?.abort();
    },
    smaller: () => smaller(context),
    remove: () => remove(context),
    outOfMemory: () => {
      tell(context, { kind: 'out-of-memory' });
    },
    onChange: (listener) => {
      live.listeners.add(listener);
    },
  };
}
