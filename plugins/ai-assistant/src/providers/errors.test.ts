import { describe, expect, it } from 'vitest';
import { kindOf } from './errors.ts';

class APIError extends Error {
  constructor(readonly status?: number) {
    super('api');
  }
}
class APIConnectionError extends APIError {}
class APIConnectionTimeoutError extends APIConnectionError {}
class APIUserAbortError extends APIError {}

const SDK = { APIError, APIConnectionError, APIConnectionTimeoutError, APIUserAbortError };

describe('kindOf', () => {
  it('names what went wrong, from the SDK’s own classes first, then the status', () => {
    expect(kindOf(new APIUserAbortError(), SDK)).toBe('cancelled');
    expect(kindOf(new APIConnectionTimeoutError(), SDK)).toBe('timeout');
    expect(kindOf(new APIConnectionError(), SDK)).toBe('network');
    expect(kindOf(new APIError(422), SDK)).toBe('bad-request');
    expect(kindOf(new APIError(403), SDK)).toBe('auth');
    expect(kindOf(new APIError(418), SDK)).toBe('failed');
    expect(kindOf(new APIError(), SDK)).toBe('failed');
    expect(kindOf(new Error('other'), SDK)).toBe('failed');
  });
});
