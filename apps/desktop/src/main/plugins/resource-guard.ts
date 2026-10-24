import { en } from '../../shared/messages/en.ts';

/** How often each plugin's renderer is sampled. */
export const PLUGIN_SAMPLE_MS = 5_000;
/** Samples in a row over a limit before acting, so a brief spike is forgiven. */
export const SAMPLES_OVER_LIMIT = 3;
/**
 * Half of one core: a plugin has no reason to keep a core busy, since it
 * waits on the user and on the network.
 */
export const CPU_LIMIT_PERCENT = 50;
export const MEMORY_LIMIT_MB = 256;
/** Restarts within the window that stop the plugin instead. */
export const RESTARTS_BEFORE_STOP = 3;
/** Restarts further apart than ten minutes are unrelated, so they never add up to a stop. */
export const RESTART_WINDOW_MS = 600_000;

const KB_PER_MB = 1024;

/** One process, as `app.getAppMetrics()` reports it. */
export interface ProcessMetrics {
  readonly pid: number;
  readonly cpu: { readonly percentCPUUsage: number };
  /** Kilobytes. */
  readonly memory: { readonly workingSetSize: number };
}

/** A running plugin and its renderer's process. */
export interface PluginProcess {
  readonly id: string;
  readonly name: string;
  readonly pid: number;
}

export interface ResourceGuardDependencies {
  readonly metrics: () => readonly ProcessMetrics[];
  readonly running: () => readonly PluginProcess[];
  readonly restart: (id: string) => void;
  /** Stops the plugin until YapYap restarts or the plugin is installed again. */
  readonly stop: (id: string) => void;
  /** Tells the user, with a system notification. */
  readonly notify: (message: string) => void;
  readonly every: (callback: () => void, ms: number) => unknown;
  readonly now: () => number;
  /** The computer's logical cores, such as `os.availableParallelism()`. */
  readonly cores: number;
  readonly warn: (message: string) => void;
}

/** Which limit a sample breaks, if any. */
function excess(metric: ProcessMetrics | undefined, cores: number): 'CPU' | 'memory' | undefined {
  if (metric === undefined) {
    return undefined;
  }
  // Electron spreads the usage over every core, so one busy core reads as 1/cores of 100%.
  if (metric.cpu.percentCPUUsage * cores > CPU_LIMIT_PERCENT) {
    return 'CPU';
  }
  return metric.memory.workingSetSize / KB_PER_MB > MEMORY_LIMIT_MB ? 'memory' : undefined;
}

/** Restarts a plugin that broke a limit, or stops one that keeps breaking them. */
function act(
  deps: ResourceGuardDependencies,
  restarts: Map<string, number[]>,
  plugin: PluginProcess,
  limit: string,
): void {
  const now = deps.now();
  const recent = [...(restarts.get(plugin.id) ?? []), now].filter(
    (time) => now - time < RESTART_WINDOW_MS,
  );
  if (recent.length >= RESTARTS_BEFORE_STOP) {
    restarts.delete(plugin.id);
    deps.stop(plugin.id);
    deps.warn(`Plugin ${plugin.id} kept going over its ${limit} limit and was stopped.`);
    deps.notify(en.plugins.stopped(plugin.name));
    return;
  }
  restarts.set(plugin.id, recent);
  deps.warn(`Plugin ${plugin.id} went over its ${limit} limit and was restarted.`);
  deps.restart(plugin.id);
}

/**
 * Keeps plugins within their CPU and memory limits (ADR 0004, #97): a
 * plugin over a limit for several samples in a row is restarted, and one
 * restarted too often in a short while is stopped and the user told.
 */
export function guardPluginResources(deps: ResourceGuardDependencies): void {
  const over = new Map<string, number>();
  const restarts = new Map<string, number[]>();
  deps.every(() => {
    const metrics = deps.metrics();
    for (const plugin of deps.running()) {
      const limit = excess(
        metrics.find((metric) => metric.pid === plugin.pid),
        deps.cores,
      );
      const count = limit === undefined ? 0 : (over.get(plugin.id) ?? 0) + 1;
      over.set(plugin.id, count >= SAMPLES_OVER_LIMIT ? 0 : count);
      if (limit !== undefined && count >= SAMPLES_OVER_LIMIT) {
        act(deps, restarts, plugin, limit);
      }
    }
  }, PLUGIN_SAMPLE_MS);
}
