import { en } from '../../shared/messages/en.ts';

/** How long a trace records: long enough to catch a slow moment the user brings about. */
const TRACE_SECONDS = 10;

/**
 * What Chromium records: where time goes in pages, scripts, layout and
 * drawing. Memory dumps and screenshots are left out, since they can hold
 * messages.
 */
export const TRACE_CATEGORIES: readonly string[] = [
  'toplevel',
  'benchmark',
  'blink',
  'cc',
  'gpu',
  'v8',
  'loading',
  'renderer.scheduler',
  'disabled-by-default-devtools.timeline',
];

/** What the user is told once the trace is saved, or could not be. */
interface TraceMessage {
  readonly type: 'info' | 'warning';
  readonly message: string;
  readonly detail: string;
}

/** What the user is asked before anything is recorded. */
interface TraceQuestion {
  readonly type: 'question';
  readonly message: string;
  readonly detail: string;
  readonly buttons: string[];
  readonly defaultId: number;
  readonly cancelId: number;
}

const START = 0;

const QUESTION: TraceQuestion = {
  type: 'question',
  message: en.trace.confirm,
  detail: en.trace.confirmDetail,
  buttons: [en.trace.choose, en.common.cancel],
  defaultId: START,
  cancelId: 1,
};

export interface TraceDependencies {
  /** Shows `question` and answers with the index of the button the user chose. */
  readonly ask: (question: TraceQuestion) => Promise<{ readonly response: number }>;
  /** Where to save the trace, as the save dialog answers. */
  readonly chooseFile: () => Promise<{ readonly canceled: boolean; readonly filePath?: string }>;
  readonly start: (categories: readonly string[]) => Promise<unknown>;
  /** Stops recording and writes the trace to `path`. */
  readonly stop: (path: string) => Promise<unknown>;
  readonly wait: (ms: number) => Promise<void>;
  readonly tell: (message: TraceMessage) => void;
  readonly warn: (message: string) => void;
}

/**
 * Help → Record a Performance Trace (#113): after the user agrees and picks
 * a file, records what Chromium does for a few seconds and saves it there.
 * Nothing is sent anywhere; the user decides whether to share the file.
 */
export async function recordTrace(deps: TraceDependencies): Promise<void> {
  const { response } = await deps.ask(QUESTION);
  if (response !== START) {
    return;
  }
  const { canceled, filePath: path } = await deps.chooseFile();
  if (canceled || path === undefined) {
    return;
  }
  try {
    await deps.start(TRACE_CATEGORIES);
    await deps.wait(TRACE_SECONDS * 1000);
    await deps.stop(path);
    deps.tell({ type: 'info', message: en.trace.saved, detail: en.trace.savedDetail });
  } catch {
    deps.warn('Could not record a performance trace.');
    deps.tell({ type: 'warning', message: en.trace.failed, detail: en.trace.failedDetail });
  }
}
