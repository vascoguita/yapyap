/** How often the WhatsApp renderer's memory is sampled. */
export const MEMORY_SAMPLE_MS = 60_000;
/** Samples in a row over the limit before acting, so a brief spike never reloads. */
export const SAMPLES_OVER_LIMIT = 2;
/** Input within this many seconds means the user is busy in the window. */
export const ACTIVE_WITHIN_S = 60;
/**
 * Past this multiple of the limit the renderer reloads even while in use:
 * it is about to slow the whole computer down or be killed by the system.
 */
export const HARD_LIMIT_FACTOR = 1.5;

const KB_PER_MB = 1024;

export interface ProcessMemory {
  readonly pid: number;
  /** Kilobytes, as `app.getAppMetrics()` reports them. */
  readonly memory: { readonly workingSetSize: number };
}

export interface WatchedRenderer {
  getOSProcessId(): number;
  reload(): void;
  once(event: 'destroyed', listener: () => void): unknown;
}

export interface MemoryWatchdogDependencies<Timer = unknown> {
  readonly metrics: () => readonly ProcessMemory[];
  readonly limitMb: () => number;
  /** Whether the user has the window focused. */
  readonly focused: () => boolean;
  /** Seconds since the last keyboard or mouse input anywhere. */
  readonly idleSeconds: () => number;
  readonly every: (callback: () => void, ms: number) => Timer;
  readonly stop: (timer: Timer) => void;
  readonly warn: (message: string) => void;
}

function usageMb(renderer: WatchedRenderer, metrics: readonly ProcessMemory[]): number | undefined {
  const pid = renderer.getOSProcessId();
  const process = metrics.find((metric) => metric.pid === pid);
  return process === undefined ? undefined : Math.round(process.memory.workingSetSize / KB_PER_MB);
}

/**
 * Reloads the WhatsApp renderer when it keeps using more memory than the
 * limit in settings. A reload keeps the login and frees what the page
 * leaked. It waits while the user is typing or reading in the window, so a
 * draft is never lost mid-sentence; WhatsApp keeps per-chat drafts itself.
 * The log records only sizes and limits. It stops with the renderer, as
 * when its account is removed, since a destroyed one throws when asked.
 */
export function watchMemory<Timer>(
  renderer: WatchedRenderer,
  deps: MemoryWatchdogDependencies<Timer>,
): void {
  let over = 0;
  const timer = deps.every(() => {
    const used = usageMb(renderer, deps.metrics());
    const limit = deps.limitMb();
    if (used === undefined || used <= limit) {
      over = 0;
      return;
    }
    over += 1;
    const busy = deps.focused() && deps.idleSeconds() < ACTIVE_WITHIN_S;
    if (over < SAMPLES_OVER_LIMIT || (busy && used < limit * HARD_LIMIT_FACTOR)) {
      return;
    }
    over = 0;
    deps.warn(
      `The WhatsApp renderer used ${String(used)} MB, over the ${String(limit)} MB limit; reloading it.`,
    );
    renderer.reload();
  }, MEMORY_SAMPLE_MS);
  renderer.once('destroyed', () => {
    deps.stop(timer);
  });
}
