import type { ExtensionError, ExtensionErrorKind } from '@yapyap/extension-sdk';
import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

/** One host operation an extension may call, and what it needs. */
export interface RpcMethod {
  /** The manifest capability the extension must hold; none for what is the extension's own. */
  readonly capability?: string;
  /** The call's parameters, as a tuple. */
  readonly params: TSchema;
  readonly run: (params: readonly unknown[]) => Promise<unknown>;
}

/** The main process's end of an extension's port. */
export interface RpcPort {
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): unknown;
  postMessage(message: unknown): void;
  start(): void;
}

/** How fast an extension may call: a token bucket per extension (ADR 0004). */
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
  readonly kind: ExtensionErrorKind;

  constructor(kind: ExtensionErrorKind, message: string) {
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
  granted: (capability: string) => boolean,
  take: () => boolean,
  options: RpcOptions,
): Promise<unknown> {
  const method = Object.hasOwn(methods, message.method) ? methods[message.method] : undefined;
  if (method === undefined || !Value.Check(method.params, message.params)) {
    throw new RpcFailure('invalid', 'The call does not match the API.');
  }
  if (method.capability !== undefined && !granted(method.capability)) {
    throw new RpcFailure('not-granted', `The extension does not hold ${method.capability}.`);
  }
  if (!take()) {
    throw new RpcFailure('rate-limited', 'The extension is calling too often.');
  }
  return withTimeout(method.run(message.params), options);
}

/** What the extension learns of a failure: its kind, and never the cause behind an unexpected one. */
function errorOf(error: unknown): ExtensionError {
  const failure =
    error instanceof RpcFailure ? error : new RpcFailure('failed', 'The call failed.');
  return { kind: failure.kind, message: failure.message };
}

/** A call to an offered operation, as the activity log records it (#99). */
export interface AuditedCall {
  readonly method: string;
  readonly capability: string;
  readonly outcome: 'ok' | ExtensionErrorKind;
}

/**
 * Serves an extension's calls on its port (ADR 0004). Each message is checked
 * against the envelope and the method's parameters, then the extension's
 * grants and its rate, and runs with a timeout. Every call gets a result or
 * a typed error; one without a usable ID gets nothing. Each call to an
 * offered operation is audited by name and outcome; parameters and results
 * never are, and neither are names the extension made up.
 */
export function serveExtensionRpc(
  port: RpcPort,
  granted: (capability: string) => boolean,
  methods: Readonly<Record<string, RpcMethod>>,
  options: RpcOptions,
  audit: (call: AuditedCall) => void,
): void {
  const take = tokenBucket(options.rate, options.now);
  port.on('message', ({ data }) => {
    if (!Value.Check(Envelope, data)) {
      return;
    }
    const offered = Object.hasOwn(methods, data.method) ? methods[data.method] : undefined;
    const report = (outcome: AuditedCall['outcome']): void => {
      if (offered?.capability !== undefined) {
        audit({ method: data.method, capability: offered.capability, outcome });
      }
    };
    dispatch(data, methods, granted, take, options).then(
      (result) => {
        report('ok');
        port.postMessage({ id: data.id, result });
      },
      (error: unknown) => {
        const reply = errorOf(error);
        report(reply.kind);
        port.postMessage({ id: data.id, error: reply });
      },
    );
  });
  port.start();
}
