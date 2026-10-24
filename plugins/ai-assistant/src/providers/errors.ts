import type { ProviderErrorKind } from './provider.ts';

type ErrorClass = abstract new (...args: never[]) => Error;

/** The error classes both vendors' SDKs share, as each exports them. */
export interface SdkErrors {
  readonly APIUserAbortError: ErrorClass;
  readonly APIConnectionTimeoutError: ErrorClass;
  readonly APIConnectionError: ErrorClass;
  readonly APIError: ErrorClass;
}

/** The request itself was wrong: a model or setting the provider does not accept. */
const BAD_REQUEST: ProviderErrorKind = 'bad-request';

/** What an HTTP status from the provider means to the user. */
const BY_STATUS: Readonly<Partial<Record<number, ProviderErrorKind>>> = {
  400: BAD_REQUEST,
  401: 'auth',
  403: 'auth',
  404: BAD_REQUEST,
  422: BAD_REQUEST,
  429: 'rate-limited',
};

/**
 * The kind of a failure an SDK raised. Its own classes come first, since the
 * cancelled, timed-out and unreachable cases are API errors without a status.
 */
export function kindOf(error: unknown, sdk: SdkErrors): ProviderErrorKind {
  if (error instanceof sdk.APIUserAbortError) {
    return 'cancelled';
  }
  if (error instanceof sdk.APIConnectionTimeoutError) {
    return 'timeout';
  }
  if (error instanceof sdk.APIConnectionError) {
    return 'network';
  }
  const { status } = error instanceof sdk.APIError ? (error as { status?: unknown }) : {};
  return (typeof status === 'number' ? BY_STATUS[status] : undefined) ?? 'failed';
}
