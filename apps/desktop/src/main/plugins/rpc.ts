import type { PluginError, PluginErrorKind } from '@yapyap/plugin-sdk';
import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

/** One host operation a plugin may call, and what it needs. */
export interface RpcMethod {
  /** The manifest capability the plugin must hold. */
  readonly capability: string;
  /** The call's parameters, as a tuple. */
  readonly params: TSchema;
  readonly run: (params: readonly unknown[]) => Promise<unknown>;
}

/** The main process's end of a plugin's port. */
export interface RpcPort {
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): unknown;
  postMessage(message: unknown): void;
  start(): void;
}

/** How fast a plugin may call: a token bucket per plugin (ADR 0004). */
export interface RateLimit {
  readonly burst: number;
  readonly perSecond: number;
}

export interface RpcOptions {
  readonly rate: RateLimit;
  readonly timeoutMs: number;
  readonly now: () => number;
  /** Runs `callback` once after `ms`, for call timeouts. */
  readonly after: (ms: number, callback: () => void) => void;
}

export const RPC_OPTIONS: Omit<RpcOptions, 'now' | 'after'> = {
  rate: { burst: 20, perSecond: 5 },
  timeoutMs: 10_000,
};

const Envelope = Type.Object(
  {
    id: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    method: Type.String({ maxLength: 64 }),
    params: Type.Array(Type.Unknown(), { maxItems: 8 }),
  },
  { additionalProperties: false },
);

class RpcFailure extends Error {
  readonly kind: PluginErrorKind;

  constructor(kind: PluginErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Takes a token when one is left; tokens come back at `perSecond`, up to `burst`. */
export function tokenBucket({ burst, perSecond }: RateLimit, now: () => number): () => boolean {
  let tokens = burst;
  let last = now();
  return () => {
    const time = now();
    tokens = Math.min(burst, tokens + ((time - last) / 1000) * perSecond);
    last = time;
    if (tokens < 1) {
      return false;
    }
    tokens -= 1;
    return true;
  };
}

function withTimeout<T>(work: Promise<T>, options: RpcOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    options.after(options.timeoutMs, () => {
      reject(new RpcFailure('timeout', 'The call took too long.'));
    });
    work.then(resolve, () => {
      reject(new RpcFailure('failed', 'The call failed.'));
    });
  });
}

/** The four checks of ADR 0004, in order; the first that fails stops the call. */
async function dispatch(
  message: { readonly method: string; readonly params: readonly unknown[] },
  methods: Readonly<Record<string, RpcMethod>>,
  granted: ReadonlySet<string>,
  take: () => boolean,
  options: RpcOptions,
): Promise<unknown> {
  const method = Object.hasOwn(methods, message.method) ? methods[message.method] : undefined;
  if (method === undefined || !Value.Check(method.params, message.params)) {
    throw new RpcFailure('invalid', 'The call does not match the API.');
  }
  if (!granted.has(method.capability)) {
    throw new RpcFailure('not-granted', `The plugin does not hold ${method.capability}.`);
  }
  if (!take()) {
    throw new RpcFailure('rate-limited', 'The plugin is calling too often.');
  }
  return withTimeout(method.run(message.params), options);
}

/** What the plugin learns of a failure: its kind, and never the cause behind an unexpected one. */
function errorOf(error: unknown): PluginError {
  const failure =
    error instanceof RpcFailure ? error : new RpcFailure('failed', 'The call failed.');
  return { kind: failure.kind, message: failure.message };
}

/**
 * Serves a plugin's calls on its port (ADR 0004). Each message is checked
 * against the envelope and the method's parameters, then the plugin's
 * grants and its rate, and runs with a timeout. Every call gets a result or
 * a typed error; one without a usable ID gets nothing. Parameters and
 * results are never logged.
 */
export function servePluginRpc(
  port: RpcPort,
  granted: ReadonlySet<string>,
  methods: Readonly<Record<string, RpcMethod>>,
  options: RpcOptions,
): void {
  const take = tokenBucket(options.rate, options.now);
  port.on('message', ({ data }) => {
    if (!Value.Check(Envelope, data)) {
      return;
    }
    dispatch(data, methods, granted, take, options).then(
      (result) => {
        port.postMessage({ id: data.id, result });
      },
      (error: unknown) => {
        port.postMessage({ id: data.id, error: errorOf(error) });
      },
    );
  });
  port.start();
}
