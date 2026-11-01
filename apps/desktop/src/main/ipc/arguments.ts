/** Checks one argument of an IPC call. */
export type ArgumentCheck = (value: unknown) => boolean;

/** Checks the whole payload of an IPC call. */
export type PayloadCheck = (args: readonly unknown[]) => boolean;

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** For operations that take no arguments. */
export const noArguments: PayloadCheck = (args) => args.length === 0;

/**
 * For operations that take these arguments in order and nothing more. A
 * missing trailing argument counts as `undefined`.
 */
export const argumentsOf =
  (...checks: readonly ArgumentCheck[]): PayloadCheck =>
  (args) =>
    args.length <= checks.length && checks.every((check, index) => check(args[index]));
